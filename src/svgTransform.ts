/**
 * Copyright 2025 Miguel Ángel Durán
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const BASE64_PREFIX = '__JSX_BASE64__'
const BASE64_SUFFIX = '__'

function encodeJsx (content: string): string {
  return BASE64_PREFIX + Buffer.from(content).toString('base64') + BASE64_SUFFIX
}

function decodeJsx (content: string): string | null {
  if (content.startsWith(BASE64_PREFIX) && content.endsWith(BASE64_SUFFIX)) {
    const b64 = content.slice(BASE64_PREFIX.length, -BASE64_SUFFIX.length)
    return Buffer.from(b64, 'base64').toString('utf-8')
  }
  return null
}

/**
 * Map of JSX camelCase attributes to SVG kebab-case attributes
 */
export const jsxToSvgAttributeMap: Record<string, string> = {
  // Stroke attributes
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  // Fill attributes
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  // Clip attributes
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  // Font attributes
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontStyle: 'font-style',
  fontWeight: 'font-weight',
  // Text attributes
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
  dominantBaseline: 'dominant-baseline',
  alignmentBaseline: 'alignment-baseline',
  baselineShift: 'baseline-shift',
  // Gradient/filter attributes
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  lightingColor: 'lighting-color',
  // Marker attributes
  markerStart: 'marker-start',
  markerMid: 'marker-mid',
  markerEnd: 'marker-end',
  // Other attributes
  paintOrder: 'paint-order',
  vectorEffect: 'vector-effect',
  shapeRendering: 'shape-rendering',
  imageRendering: 'image-rendering',
  pointerEvents: 'pointer-events',
  xlinkHref: 'xlink:href'
}

/**
 * Create the reverse map: SVG kebab-case to JSX camelCase
 */
export const svgToJsxAttributeMap: Record<string, string> = Object.fromEntries(
  Object.entries(jsxToSvgAttributeMap).map(([jsx, svg]) => [svg, jsx])
)

/**
 * Detects if the SVG content contains JSX-specific syntax
 * (camelCase attributes, expression values like {2}, className, etc.)
 */
export function isJsxSvg (svgContent: string): boolean {
  // Check for JSX expression values like ={2} or ={variable}
  if (/=\{[^}]+\}/.test(svgContent)) {
    return true
  }

  // Check for spread attributes like {...props}
  if (/\{\.\.\.[^}]+\}/.test(svgContent)) {
    return true
  }

  // Check for className attribute
  if (/\bclassName=/.test(svgContent)) {
    return true
  }

  // Check for any known JSX camelCase attributes
  for (const jsxAttr of Object.keys(jsxToSvgAttributeMap)) {
    const regex = new RegExp(`\\b${jsxAttr}=`, 'g')
    if (regex.test(svgContent)) {
      return true
    }
  }

  // Check for Astro directives (client:load, client:only, etc.)
  if (/(?:\s|^)client:[a-z-]+/.test(svgContent)) {
    return true
  }

  // Check for Vue directives (v-if, v-bind:prop, :prop, @click)
  // Search for :, @ or v- followed by a character
  // We use a regex that matches them as standalone "words" or after spaces
  const vueRegex = /(?:\s|^)(v-|[:@])[a-zA-Z0-9-:]+/g
  let match
  while ((match = vueRegex.exec(svgContent))) {
    const attr = match[0].trim()
    // Avoid matching standard namespaces
    if (!/^(xmlns|xlink|xml|sketch):/.test(attr)) {
      return true
    }
  }

  // Check for JSX comments
  if (/\{\/\*[\s\S]*?\*\/\}/.test(svgContent)) {
    return true
  }

  // Check for line comments // (common in JSX)
  if (/^\s*\/\//m.test(svgContent)) {
    return true
  }

  return false
}



/**
 * Converts JSX SVG syntax to valid SVG XML
 * - Converts expression values {2} to "2"
 * - Converts className to class
 * - Converts camelCase attributes to kebab-case
 */
/**
 * Helper to replace JSX expressions like ={...} with ="..."
 * Handles nested braces and strings correctly
 */
function replaceJsxExpressions (content: string): string {
  let result = ''
  let currentIndex = 0

  while (currentIndex < content.length) {
    const startIdx = content.indexOf('={', currentIndex)
    if (startIdx === -1) {
      result += content.slice(currentIndex)
      break
    }

    // Append everything before "={"
    result += content.slice(currentIndex, startIdx)

    // Find matching brace
    let balance = 1
    let j = startIdx + 2
    let found = false
    let inString = false
    let stringChar = ''

    while (j < content.length) {
      const char = content[j]
      const prevChar = content[j - 1]

      if (inString) {
        if (char === stringChar && prevChar !== '\\') {
          inString = false
        }
      } else {
        if (char === '"' || char === '\'' || char === '`') {
          inString = true
          stringChar = char
        } else if (char === '{') {
          balance++
        } else if (char === '}') {
          balance--
        }
      }

      j++

      if (!inString && balance === 0) {
        found = true
        break
      }
    }

    if (found) {
      const expression = content.slice(startIdx + 2, j - 1)
      result += `="${encodeJsx(expression)}"`
      currentIndex = j
    } else {
      // Failed to find matching brace, just skip "={"
      result += '={'
      currentIndex = startIdx + 2
    }
  }

  return result
}

function removeJsxComments (content: string): string {
  // Remove block comments {/* ... */}
  content = content.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  // Remove line comments // ... that are on their own line (common in JSX)
  // We use the 'm' flag so ^ matches start of line
  content = content.replace(/^\s*\/\/.*$/gm, '')
  return content
}

function protectEncodedAttributes (content: string): string {
  // Protect any attribute that has a Base64 encoded value OR is a framework directive
  // Matches: attr="..." or just attr (boolean)
  // We avoid \b because it doesn't work with prefix like : or @
  return content.replace(/(?:\s|^)([a-zA-Z0-9-:@]+)(?:=(["'])([\s\S]*?)\2)?/g, (match, attr, quote, value) => {
    const prefix = match.startsWith(' ') ? ' ' : ''
    
    // Skip if it's already a temp attribute
    if (attr.startsWith('data-better-svg-temp-')) return match

    // Decide if we should protect this attribute
    const isEncoded = value?.includes(BASE64_PREFIX)
    const isDirective = /^(client:|v-|[:@]|class:list)/.test(attr) && !/^(xmlns|xlink|xml|sketch):/.test(attr)
    
    if (!isEncoded && !isDirective) {
      return match
    }

    // Sanitize attribute name for use in data- attribute
    const safeAttr = attr.replace(/:/g, '__COLON__').replace(/@/g, '__AT__')
    
    if (value !== undefined) {
      return `${prefix}data-better-svg-temp-${safeAttr}="${value}"`
    } else {
      // Boolean attribute (e.g. client:only)
      return `${prefix}data-better-svg-temp-${safeAttr}="__BOOLEAN__"`
    }
  })
}

function restoreEncodedAttributes (content: string): string {
  // Restore protected attributes
  // data-better-svg-temp-ATTR="..." -> ATTR="..."
  return content.replace(/data-better-svg-temp-([a-zA-Z0-9-_]+)="([^"]*)"/g, (match, safeAttr, value) => {
    const attr = safeAttr.replace(/__COLON__/g, ':').replace(/__AT__/g, '@')
    
    if (value === '__BOOLEAN__') {
      return attr
    }
    return `${attr}="${value}"`
  })
}

/**
 * Converts JSX SVG syntax to valid SVG XML
 * - Converts expression values {2} to "2"
 * - Converts className to class
 * - Converts camelCase attributes to kebab-case
 */
export function convertJsxToSvg (svgContent: string): string {
  // Remove JSX comments first to avoid parsing issues
  svgContent = removeJsxComments(svgContent)

  // Convert JSX expression values like {2} to "2"
  // Handle both simple values and expressions using the robust parser
  svgContent = replaceJsxExpressions(svgContent)

  // Convert spread attributes {...props} to data-spread-i="props"
  let spreadIndex = 0
  svgContent = svgContent.replace(/\{\.\.\.([^}]+)\}/g, (_match, expression) => {
    return `data-spread-${spreadIndex++}="${encodeJsx(expression)}"`
  })

  // Convert className to class
  svgContent = svgContent.replace(/\bclassName=/g, 'class=')

  // Convert all JSX camelCase attributes to SVG kebab-case
  for (const [jsx, svg] of Object.entries(jsxToSvgAttributeMap)) {
    const regex = new RegExp(`\\b${jsx}=`, 'g')
    svgContent = svgContent.replace(regex, `${svg}=`)
  }
  
  // Protect all attributes with encoded values from SVGO
  // This handles style, event handlers, and anything else that is dynamically encoded
  svgContent = protectEncodedAttributes(svgContent)

  return svgContent
}

/**
 * Converts SVG XML syntax back to JSX
 * - Converts class to className
 * - Converts kebab-case attributes to camelCase
 */
export function convertSvgToJsx (svgContent: string): string {
  // Restore protected attributes first
  svgContent = restoreEncodedAttributes(svgContent)

  // Convert class to className
  svgContent = svgContent.replace(/\bclass=/g, 'className=')


  // Convert all SVG kebab-case attributes to JSX camelCase
  for (const [svg, jsx] of Object.entries(svgToJsxAttributeMap)) {
    // Need to escape hyphens and colons for regex
    const escapedSvg = svg.replace(/[-:]/g, '\\$&')
    const regex = new RegExp(`\\b${escapedSvg}=`, 'g')
    svgContent = svgContent.replace(regex, `${jsx}=`)
  }

  // Restore spread attributes
  svgContent = svgContent.replace(/\bdata-spread-\d+="([^"]*)"/g, (_match, value) => {
    const decoded = decodeJsx(value)
    // If it wasn't encoded (legacy/fallback), try simple unescape or keep as is? 
    // Just handling our new logic:
    if (decoded !== null) {
      return `{...${decoded}}`
    }
    // Fallback for old behavior (though we overwrote it) or other cases
    const unescaped = value
      .replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
    return `{...${unescaped}}`
  })

  // Decode Base64 expressions in attributes
  // content="encoded" -> content={expression}
  // This matches any attribute with our specific prefix/suffix pattern
  // Use a regex that captures the attribute name and the quoted value
  // We handle both double and single quotes
  // We also handle cases where potential quoting issues might arise (though protected attrs help)
  svgContent = svgContent.replace(/(\w+)=(["'])(__JSX_BASE64__[^"']*?__)\2/g, (match, attr, quote, value) => {
    const decoded = decodeJsx(value)
    if (decoded !== null) {
      return `${attr}={${decoded}}`
    }
    return match
  })

  return svgContent
}

/**
 * Prepares JSX SVG content for SVGO optimization
 * Returns the converted SVG and metadata about whether conversion was applied
 */
export function prepareForOptimization (svgContent: string): {
  preparedSvg: string
  wasJsx: boolean
} {
  const wasJsx = isJsxSvg(svgContent)

  if (wasJsx) {
    return {
      preparedSvg: convertJsxToSvg(svgContent),
      wasJsx: true
    }
  }

  return {
    preparedSvg: svgContent,
    wasJsx: false
  }
}

/**
 * Converts optimized SVG back to JSX if the original was JSX
 */
export function finalizeAfterOptimization (optimizedSvg: string, wasJsx: boolean): string {
  if (wasJsx) {
    return convertSvgToJsx(optimizedSvg)
  }

  return optimizedSvg
}

