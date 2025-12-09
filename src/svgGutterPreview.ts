import * as vscode from 'vscode'

interface SvgCacheEntry {
  dataUri: string
  sizeBytes: number
  timestamp: number
}

export class SvgHoverProvider implements vscode.HoverProvider {
  private svgRegex = /<svg[\s\S]*?>[\s\S]*?<\/svg>/g
  private cache: Map<string, SvgCacheEntry> = new Map()
  private cacheMaxAge = 5000 // 5 seconds

  public provideHover (
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    const text = document.getText()
    const svgRegex = /<svg[\s\S]*?>[\s\S]*?<\/svg>/g
    let match

    while ((match = svgRegex.exec(text))) {
      const startPos = document.positionAt(match.index)
      const endPos = document.positionAt(match.index + match[0].length)
      const range = new vscode.Range(startPos, endPos)

      if (range.contains(position)) {
        const originalSvg = match[0]
        const sizeBytes = Buffer.byteLength(originalSvg, 'utf8')

        // Check cache
        const cacheKey = `${document.uri.toString()}:${match.index}:${originalSvg.length}`
        const cached = this.cache.get(cacheKey)
        const now = Date.now()

        if (cached && (now - cached.timestamp) < this.cacheMaxAge) {
          return this.createHoverFromCache(cached, range)
        }

        let svgContent = originalSvg

        // Convert JSX syntax to valid SVG
        svgContent = this.convertJsxToSvg(svgContent)

        // Remove CSS class attribute (not useful in standalone SVG)
        svgContent = svgContent.replace(/\s+class\s*=\s*["'][^"']*["']/g, '')

        // Add xmlns if missing (do this early so SVG is valid)
        if (!svgContent.includes('xmlns=')) {
          svgContent = svgContent.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
        }

        // Replace currentColor based on theme
        const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                            vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast
        const contrastColor = isDarkTheme ? '#ffffff' : '#000000'
        svgContent = svgContent.replace(/currentColor/g, contrastColor)

        // Extract stroke/fill from parent SVG and propagate to children
        svgContent = this.propagateStrokeAndFill(svgContent)

        // Ensure minimum size for visibility in hover
        svgContent = this.ensureMinimumSize(svgContent, 128)

        // Encode SVG for data URI - use base64 for better compatibility
        const base64Svg = Buffer.from(svgContent).toString('base64')
        const dataUri = `data:image/svg+xml;base64,${base64Svg}`

        // Update cache
        this.cache.set(cacheKey, { dataUri, sizeBytes, timestamp: now })

        return this.createHover(dataUri, sizeBytes, range)
      }
    }

    return null
  }

  private createHover (dataUri: string, sizeBytes: number, range: vscode.Range): vscode.Hover {
    const markdown = new vscode.MarkdownString()
    markdown.isTrusted = true
    markdown.supportHtml = true
    markdown.appendMarkdown(`![SVG Preview](${dataUri})\n\n`)
    markdown.appendMarkdown(`**Size:** ${this.formatBytes(sizeBytes)}`)

    return new vscode.Hover(markdown, range)
  }

  private createHoverFromCache (cached: SvgCacheEntry, range: vscode.Range): vscode.Hover {
    return this.createHover(cached.dataUri, cached.sizeBytes, range)
  }

  private formatBytes (bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} bytes`
    }
    const kb = bytes / 1024
    return `${kb.toFixed(2)} KB`
  }

  private propagateStrokeAndFill (svgContent: string): string {
    // Extract stroke and fill from the root <svg> element
    const svgOpenTagMatch = svgContent.match(/<svg[^>]*>/i)
    if (!svgOpenTagMatch) return svgContent

    const svgOpenTag = svgOpenTagMatch[0]

    // Extract stroke attribute from svg tag
    const strokeMatch = svgOpenTag.match(/\bstroke\s*=\s*["']([^"']+)["']/)
    const stroke = strokeMatch ? strokeMatch[1] : null

    // If there's a stroke on the parent, propagate it to child elements that don't have one
    if (stroke) {
      const shapeElements = ['path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect']
      const shapeRegex = new RegExp(`<(${shapeElements.join('|')})([^>]*?)(\\/?>)`, 'gi')

      svgContent = svgContent.replace(shapeRegex, (match, tagName, attrs, ending) => {
        // Check if stroke is already present in attrs
        if (attrs && /\bstroke\s*=/.test(attrs)) {
          return match
        }
        return `<${tagName}${attrs || ''} stroke="${stroke}"${ending}`
      })
    }

    return svgContent
  }

  private ensureMinimumSize (svgContent: string, minSize: number): string {
    // Check if SVG has width/height attributes (only in svg tag, not child elements)
    const svgOpenTagMatch = svgContent.match(/<svg[^>]*>/i)
    if (!svgOpenTagMatch) return svgContent

    const svgOpenTag = svgOpenTagMatch[0]
    const hasWidth = /\bwidth\s*=\s*["'][^"']+["']/.test(svgOpenTag)
    const hasHeight = /\bheight\s*=\s*["'][^"']+["']/.test(svgOpenTag)

    // Try to get dimensions from viewBox if no explicit width/height
    const viewBoxMatch = svgOpenTag.match(/viewBox\s*=\s*["']([^"']+)["']/)

    if (!hasWidth && !hasHeight) {
      if (viewBoxMatch) {
        // Use viewBox dimensions scaled to minSize
        const viewBoxParts = viewBoxMatch[1].split(/\s+/)
        if (viewBoxParts.length >= 4) {
          const vbWidth = parseFloat(viewBoxParts[2])
          const vbHeight = parseFloat(viewBoxParts[3])
          const scale = minSize / Math.max(vbWidth, vbHeight)
          const newWidth = Math.round(vbWidth * scale)
          const newHeight = Math.round(vbHeight * scale)
          svgContent = svgContent.replace('<svg', `<svg width="${newWidth}" height="${newHeight}"`)
        } else {
          svgContent = svgContent.replace('<svg', `<svg width="${minSize}" height="${minSize}"`)
        }
      } else {
        // No viewBox either, add default size
        svgContent = svgContent.replace('<svg', `<svg width="${minSize}" height="${minSize}"`)
      }
    } else {
      // Scale up small SVGs
      const widthMatch = svgOpenTag.match(/\bwidth\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/)
      const heightMatch = svgOpenTag.match(/\bheight\s*=\s*["'](\d+(?:\.\d+)?)(?:px)?["']/)

      if (widthMatch && heightMatch) {
        const width = parseFloat(widthMatch[1])
        const height = parseFloat(heightMatch[1])

        if (width < minSize && height < minSize) {
          const scale = minSize / Math.max(width, height)
          const newWidth = Math.round(width * scale)
          const newHeight = Math.round(height * scale)

          svgContent = svgContent
            .replace(/\bwidth\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/, `width="${newWidth}"`)
            .replace(/\bheight\s*=\s*["']\d+(?:\.\d+)?(?:px)?["']/, `height="${newHeight}"`)
        }
      }
    }

    return svgContent
  }

  private convertJsxToSvg (svgContent: string): string {
    // Convert JSX expression values like {2} to "2"
    svgContent = svgContent.replace(/=\{([^}]+)\}/g, '="$1"')

    // Convert className to class
    svgContent = svgContent.replace(/\bclassName=/g, 'class=')

    // Map of JSX camelCase attributes to SVG kebab-case
    const jsxToSvgAttributes: Record<string, string> = {
      strokeWidth: 'stroke-width',
      strokeLinecap: 'stroke-linecap',
      strokeLinejoin: 'stroke-linejoin',
      strokeDasharray: 'stroke-dasharray',
      strokeDashoffset: 'stroke-dashoffset',
      strokeMiterlimit: 'stroke-miterlimit',
      strokeOpacity: 'stroke-opacity',
      fillOpacity: 'fill-opacity',
      fillRule: 'fill-rule',
      clipPath: 'clip-path',
      clipRule: 'clip-rule',
      fontFamily: 'font-family',
      fontSize: 'font-size',
      fontStyle: 'font-style',
      fontWeight: 'font-weight',
      textAnchor: 'text-anchor',
      textDecoration: 'text-decoration',
      dominantBaseline: 'dominant-baseline',
      alignmentBaseline: 'alignment-baseline',
      baselineShift: 'baseline-shift',
      stopColor: 'stop-color',
      stopOpacity: 'stop-opacity',
      colorInterpolation: 'color-interpolation',
      colorInterpolationFilters: 'color-interpolation-filters',
      floodColor: 'flood-color',
      floodOpacity: 'flood-opacity',
      lightingColor: 'lighting-color',
      markerStart: 'marker-start',
      markerMid: 'marker-mid',
      markerEnd: 'marker-end',
      paintOrder: 'paint-order',
      vectorEffect: 'vector-effect',
      shapeRendering: 'shape-rendering',
      imageRendering: 'image-rendering',
      pointerEvents: 'pointer-events',
      xlinkHref: 'xlink:href'
    }

    for (const [jsx, svg] of Object.entries(jsxToSvgAttributes)) {
      const regex = new RegExp(`\\b${jsx}=`, 'g')
      svgContent = svgContent.replace(regex, `${svg}=`)
    }

    return svgContent
  }

  public clearCache (): void {
    this.cache.clear()
  }
}

export class SvgGutterPreview {
  private decorationTypes: Map<string, vscode.TextEditorDecorationType[]> = new Map()

  public updateDecorations (editor: vscode.TextEditor) {
    if (!editor) {
      return
    }

    const docUri = editor.document.uri.toString()

    // Dispose existing decorations for this document
    this.disposeDecorationsForUri(docUri)

    const text = editor.document.getText()
    const svgRegex = /<svg[\s\S]*?>[\s\S]*?<\/svg>/g
    const newDecorationTypes: vscode.TextEditorDecorationType[] = []

    let match
    while ((match = svgRegex.exec(text))) {
      const startPos = editor.document.positionAt(match.index)
      // Use a zero-length range at the start of the SVG to ensure only one gutter icon is shown
      const range = new vscode.Range(startPos, startPos)

      let svgContent = match[0]

      // Convert JSX syntax to valid SVG
      svgContent = this.convertJsxToSvg(svgContent)

      // Remove CSS class attribute (not useful in standalone SVG)
      svgContent = svgContent.replace(/\s+class\s*=\s*["'][^"']*["']/g, '')

      // Add xmlns if missing (do this early so SVG is valid)
      if (!svgContent.includes('xmlns=')) {
        svgContent = svgContent.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"')
      }

      // Replace currentColor based on theme
      const isDarkTheme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                          vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast

      const contrastColor = isDarkTheme ? '#ffffff' : '#000000'

      svgContent = svgContent.replace(/currentColor/g, contrastColor)

      // Propagate stroke/fill from parent to children (after currentColor is resolved)
      svgContent = this.propagateStrokeAndFill(svgContent)

      // Ensure minimum size for gutter icon
      svgContent = this.ensureMinimumSize(svgContent, 16)

      // Encode SVG content for data URI - use base64 for better compatibility
      const base64Svg = Buffer.from(svgContent).toString('base64')
      const dataUri = `data:image/svg+xml;base64,${base64Svg}`

      const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.parse(dataUri),
        gutterIconSize: 'contain'
      })

      newDecorationTypes.push(decorationType)

      editor.setDecorations(decorationType, [{ range }])
    }

    this.decorationTypes.set(docUri, newDecorationTypes)
  }

  private disposeDecorationsForUri (uri: string) {
    const types = this.decorationTypes.get(uri)
    if (types) {
      types.forEach(t => t.dispose())
      this.decorationTypes.delete(uri)
    }
  }

  private propagateStrokeAndFill (svgContent: string): string {
    // Extract stroke and fill from the root <svg> element
    const svgOpenTagMatch = svgContent.match(/<svg[^>]*>/i)
    if (!svgOpenTagMatch) return svgContent

    const svgOpenTag = svgOpenTagMatch[0]

    // Extract stroke attribute from svg tag
    const strokeMatch = svgOpenTag.match(/\bstroke\s*=\s*["']([^"']+)["']/)
    const stroke = strokeMatch ? strokeMatch[1] : null

    // If there's a stroke on the parent, propagate it to child elements that don't have one
    if (stroke) {
      const shapeElements = ['path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect']
      const shapeRegex = new RegExp(`<(${shapeElements.join('|')})([^>]*?)(\\/?>)`, 'gi')

      svgContent = svgContent.replace(shapeRegex, (match, tagName, attrs, ending) => {
        // Check if stroke is already present in attrs
        if (attrs && /\bstroke\s*=/.test(attrs)) {
          return match
        }
        return `<${tagName}${attrs || ''} stroke="${stroke}"${ending}`
      })
    }

    return svgContent
  }

  private ensureMinimumSize (svgContent: string, minSize: number): string {
    // Check if SVG has width/height attributes (only in svg tag, not child elements)
    const svgOpenTagMatch = svgContent.match(/<svg[^>]*>/i)
    if (!svgOpenTagMatch) return svgContent

    const svgOpenTag = svgOpenTagMatch[0]
    const hasWidth = /\bwidth\s*=\s*["'][^"']+["']/.test(svgOpenTag)
    const hasHeight = /\bheight\s*=\s*["'][^"']+["']/.test(svgOpenTag)

    // Try to get dimensions from viewBox if no explicit width/height
    const viewBoxMatch = svgOpenTag.match(/viewBox\s*=\s*["']([^"']+)["']/)

    if (!hasWidth && !hasHeight) {
      if (viewBoxMatch) {
        const viewBoxParts = viewBoxMatch[1].split(/\s+/)
        if (viewBoxParts.length >= 4) {
          const vbWidth = parseFloat(viewBoxParts[2])
          const vbHeight = parseFloat(viewBoxParts[3])
          const scale = minSize / Math.max(vbWidth, vbHeight)
          const newWidth = Math.round(vbWidth * scale)
          const newHeight = Math.round(vbHeight * scale)
          svgContent = svgContent.replace('<svg', `<svg width="${newWidth}" height="${newHeight}"`)
        } else {
          svgContent = svgContent.replace('<svg', `<svg width="${minSize}" height="${minSize}"`)
        }
      } else {
        svgContent = svgContent.replace('<svg', `<svg width="${minSize}" height="${minSize}"`)
      }
    }

    return svgContent
  }

  private convertJsxToSvg (svgContent: string): string {
    // Convert JSX expression values like {2} to "2"
    svgContent = svgContent.replace(/=\{([^}]+)\}/g, '="$1"')

    // Convert className to class
    svgContent = svgContent.replace(/\bclassName=/g, 'class=')

    // Map of JSX camelCase attributes to SVG kebab-case
    const jsxToSvgAttributes: Record<string, string> = {
      strokeWidth: 'stroke-width',
      strokeLinecap: 'stroke-linecap',
      strokeLinejoin: 'stroke-linejoin',
      strokeDasharray: 'stroke-dasharray',
      strokeDashoffset: 'stroke-dashoffset',
      strokeMiterlimit: 'stroke-miterlimit',
      strokeOpacity: 'stroke-opacity',
      fillOpacity: 'fill-opacity',
      fillRule: 'fill-rule',
      clipPath: 'clip-path',
      clipRule: 'clip-rule',
      fontFamily: 'font-family',
      fontSize: 'font-size',
      fontStyle: 'font-style',
      fontWeight: 'font-weight',
      textAnchor: 'text-anchor',
      textDecoration: 'text-decoration',
      dominantBaseline: 'dominant-baseline',
      alignmentBaseline: 'alignment-baseline',
      baselineShift: 'baseline-shift',
      stopColor: 'stop-color',
      stopOpacity: 'stop-opacity',
      colorInterpolation: 'color-interpolation',
      colorInterpolationFilters: 'color-interpolation-filters',
      floodColor: 'flood-color',
      floodOpacity: 'flood-opacity',
      lightingColor: 'lighting-color',
      markerStart: 'marker-start',
      markerMid: 'marker-mid',
      markerEnd: 'marker-end',
      paintOrder: 'paint-order',
      vectorEffect: 'vector-effect',
      shapeRendering: 'shape-rendering',
      imageRendering: 'image-rendering',
      pointerEvents: 'pointer-events',
      xlinkHref: 'xlink:href'
    }

    for (const [jsx, svg] of Object.entries(jsxToSvgAttributes)) {
      const regex = new RegExp(`\\b${jsx}=`, 'g')
      svgContent = svgContent.replace(regex, `${svg}=`)
    }

    return svgContent
  }

  public dispose () {
    this.decorationTypes.forEach(types => types.forEach(t => t.dispose()))
    this.decorationTypes.clear()
  }
}
