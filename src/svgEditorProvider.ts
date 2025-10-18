import * as vscode from 'vscode'

export class SvgEditorProvider implements vscode.CustomTextEditorProvider {
  public static register (context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new SvgEditorProvider(context)
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      'betterSvg.svgEditor',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    )
    return providerRegistration
  }

  constructor (private readonly context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor (
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    }

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document)

    // Update webview when document changes
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document.uri.toString() === document.uri.toString()) {
        this.updateWebview(webviewPanel.webview, document)
      }
    })

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose()
    })

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(e => {
      switch (e.type) {
        case 'update':
          this.updateTextDocument(document, e.content)
      }
    })
  }

  private getHtmlForWebview (webview: vscode.Webview, document: vscode.TextDocument): string {
    const svgContent = document.getText()
    const escapedSvg = this.escapeHtml(svgContent)

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Better SVG Editor</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            display: flex;
            height: 100vh;
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .editor-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-right: 1px solid var(--vscode-panel-border);
        }
        .preview-container {
            width: 400px;
            display: flex;
            flex-direction: column;
            padding: 20px;
            overflow: auto;
            background-color: var(--vscode-sideBar-background);
        }
        .preview-title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 20px;
            color: var(--vscode-foreground);
        }
        .preview-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: repeating-conic-gradient(
                var(--vscode-editorWidget-background) 0% 25%,
                var(--vscode-editorWidget-border) 0% 50%
            ) 50% / 20px 20px;
            border-radius: 4px;
            overflow: auto;
        }
        textarea {
            flex: 1;
            width: 100%;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            border: none;
            outline: none;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            resize: none;
            tab-size: 2;
        }
        svg {
            max-width: 100%;
            max-height: 100%;
        }
    </style>
</head>
<body>
    <div class="editor-container">
        <textarea id="editor">${escapedSvg}</textarea>
    </div>
    <div class="preview-container">
        <div class="preview-title">Preview</div>
        <div class="preview-content" id="preview">
            ${svgContent}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');

        let updateTimeout;

        editor.addEventListener('input', () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
                const content = editor.value;
                preview.innerHTML = content;
                
                vscode.postMessage({
                    type: 'update',
                    content: content
                });
            }, 300);
        });

        // Listen for updates from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                editor.value = message.content;
                preview.innerHTML = message.content;
            }
        });
    </script>
</body>
</html>`
  }

  private updateWebview (webview: vscode.Webview, document: vscode.TextDocument) {
    webview.postMessage({
      type: 'update',
      content: document.getText()
    })
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
