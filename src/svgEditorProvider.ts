/**
 * Copyright 2025 Miguel Ángel Durán
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

export class SvgPreviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'betterSvg.preview'
  private _view?: vscode.WebviewView
  private _currentDocument?: vscode.TextDocument
  private _isVisible: boolean = false

  constructor (private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView (
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView
    this._isVisible = webviewView.visible

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    }

    // Track visibility changes
    webviewView.onDidChangeVisibility(() => {
      this._isVisible = webviewView.visible
    })

    // Initialize with current document if it's an SVG
    const editor = vscode.window.activeTextEditor
    if (editor && editor.document.fileName.endsWith('.svg')) {
      this._currentDocument = editor.document
      webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, editor.document)
    } else {
      webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, null)
    }

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(e => {
      switch (e.type) {
        case 'update':
          if (this._currentDocument) {
            this.updateTextDocument(this._currentDocument, e.content)
          }
          break
      }
    })
  }

  public updatePreview (document: vscode.TextDocument) {
    if (this._view) {
      this._currentDocument = document
      this._view.webview.postMessage({
        type: 'update',
        content: document.getText()
      })
    }
  }

  public clearPreview () {
    if (this._view) {
      this._currentDocument = undefined
      this._view.webview.postMessage({
        type: 'clear'
      })
    }
  }

  private getHtmlForWebview (webview: vscode.Webview, document: vscode.TextDocument | null): string {
    const svgContent = document ? document.getText() : '<svg></svg>'
    const escapedSvg = this.escapeHtml(svgContent)

    // Get default color from configuration
    const config = vscode.workspace.getConfiguration('betterSvg')
    const defaultColor = config.get<string>('defaultColor', '#ffffff')

    // Get URIs for webview resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js')
    )
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'styles.css')
    )

    // Read HTML template
    const htmlPath = path.join(this.context.extensionPath, 'dist', 'webview', 'index.html')
    let html = fs.readFileSync(htmlPath, 'utf8')

    // Replace placeholders
    html = html
      .replace(/{{cspSource}}/g, webview.cspSource)
      .replace(/{{stylesUri}}/g, stylesUri.toString())
      .replace(/{{scriptUri}}/g, scriptUri.toString())
      .replace(/{{escapedSvg}}/g, escapedSvg)
      .replace(/{{svgContent}}/g, svgContent)
      .replace(/{{defaultColor}}/g, defaultColor)

    return html
  }

  private updateTextDocument (document: vscode.TextDocument, content: string) {
    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      content
    )
    vscode.workspace.applyEdit(edit)
  }

  private escapeHtml (text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  }
}
