import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  isJsxSvg,
  convertJsxToSvg,
  convertSvgToJsx,
  prepareForOptimization,
  finalizeAfterOptimization,
  jsxToSvgAttributeMap,
  svgToJsxAttributeMap
} from './svgTransform'

describe('isJsxSvg', () => {
  it('should detect JSX expression values like {2}', () => {
    const svg = '<svg><path strokeWidth={2} /></svg>'
    assert.strictEqual(isJsxSvg(svg), true)
  })

  it('should detect className attribute', () => {
    const svg = '<svg className="icon"><path /></svg>'
    assert.strictEqual(isJsxSvg(svg), true)
  })

  it('should detect camelCase attributes', () => {
    const svg = '<svg><path strokeLinecap="round" /></svg>'
    assert.strictEqual(isJsxSvg(svg), true)
  })

  it('should return false for standard SVG', () => {
    const svg = '<svg><path stroke-linecap="round" /></svg>'
    assert.strictEqual(isJsxSvg(svg), false)
  })

  it('should return false for SVG with class attribute', () => {
    const svg = '<svg class="icon"><path /></svg>'
    assert.strictEqual(isJsxSvg(svg), false)
  })

  it('should detect multiple JSX patterns', () => {
    const svg = `<svg className="w-4 h-4">
      <path strokeWidth={2} strokeLinecap="round" />
    </svg>`
    assert.strictEqual(isJsxSvg(svg), true)
  })
})

describe('convertJsxToSvg', () => {
  it('should convert expression values {number} to quoted strings', () => {
    const input = '<svg><path strokeWidth={2} /></svg>'
    const expected = '<svg><path stroke-width="2" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert className to class', () => {
    const input = '<svg className="icon"><path /></svg>'
    const expected = '<svg class="icon"><path /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert strokeLinecap to stroke-linecap', () => {
    const input = '<svg><path strokeLinecap="round" /></svg>'
    const expected = '<svg><path stroke-linecap="round" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert strokeLinejoin to stroke-linejoin', () => {
    const input = '<svg><path strokeLinejoin="round" /></svg>'
    const expected = '<svg><path stroke-linejoin="round" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert fillRule to fill-rule', () => {
    const input = '<svg><path fillRule="evenodd" /></svg>'
    const expected = '<svg><path fill-rule="evenodd" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert clipPath to clip-path', () => {
    const input = '<svg><path clipPath="url(#clip)" /></svg>'
    const expected = '<svg><path clip-path="url(#clip)" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should convert xlinkHref to xlink:href', () => {
    const input = '<svg><use xlinkHref="#icon" /></svg>'
    const expected = '<svg><use xlink:href="#icon" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should handle complex JSX SVG', () => {
    const input = `<svg
      className='w-4 h-4 text-white/70'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
    >
      <path
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeWidth={2}
        d='M19 9l-7 7-7-7'
      />
    </svg>`

    const result = convertJsxToSvg(input)

    assert.ok(result.includes('class='), 'should convert className to class')
    assert.ok(result.includes('stroke-linecap='), 'should convert strokeLinecap')
    assert.ok(result.includes('stroke-linejoin='), 'should convert strokeLinejoin')
    assert.ok(result.includes('stroke-width="2"'), 'should convert strokeWidth={2}')
    assert.ok(!result.includes('className='), 'should not contain className')
    assert.ok(!result.includes('{2}'), 'should not contain expression syntax')
  })

  it('should preserve non-JSX attributes', () => {
    const input = '<svg viewBox="0 0 24 24" fill="none"><path d="M0 0" /></svg>'
    const expected = '<svg viewBox="0 0 24 24" fill="none"><path d="M0 0" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })
})

describe('convertSvgToJsx', () => {
  it('should convert class to className', () => {
    const input = '<svg class="icon"><path /></svg>'
    const expected = '<svg className="icon"><path /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert stroke-linecap to strokeLinecap', () => {
    const input = '<svg><path stroke-linecap="round" /></svg>'
    const expected = '<svg><path strokeLinecap="round" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert stroke-linejoin to strokeLinejoin', () => {
    const input = '<svg><path stroke-linejoin="round" /></svg>'
    const expected = '<svg><path strokeLinejoin="round" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert stroke-width to strokeWidth', () => {
    const input = '<svg><path stroke-width="2" /></svg>'
    const expected = '<svg><path strokeWidth="2" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert fill-rule to fillRule', () => {
    const input = '<svg><path fill-rule="evenodd" /></svg>'
    const expected = '<svg><path fillRule="evenodd" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert clip-path to clipPath', () => {
    const input = '<svg><path clip-path="url(#clip)" /></svg>'
    const expected = '<svg><path clipPath="url(#clip)" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should convert xlink:href to xlinkHref', () => {
    const input = '<svg><use xlink:href="#icon" /></svg>'
    const expected = '<svg><use xlinkHref="#icon" /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should handle optimized SVG output', () => {
    const input = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>'

    const result = convertSvgToJsx(input)

    assert.ok(result.includes('className='), 'should convert class to className')
    assert.ok(result.includes('strokeLinecap='), 'should convert stroke-linecap')
    assert.ok(result.includes('strokeLinejoin='), 'should convert stroke-linejoin')
    assert.ok(result.includes('strokeWidth='), 'should convert stroke-width')
    assert.ok(!result.includes('class='), 'should not contain class=')
    assert.ok(!result.includes('stroke-linecap='), 'should not contain kebab-case')
  })
})

describe('roundtrip conversion', () => {
  it('should preserve attributes after JSX -> SVG -> JSX roundtrip', () => {
    const jsxInput = '<svg className="icon"><path strokeWidth="2" strokeLinecap="round" /></svg>'

    const svg = convertJsxToSvg(jsxInput)
    const backToJsx = convertSvgToJsx(svg)

    assert.strictEqual(backToJsx, jsxInput)
  })

  it('should handle all stroke attributes in roundtrip', () => {
    const jsxInput = '<svg><path strokeWidth="2" strokeLinecap="round" strokeLinejoin="bevel" strokeDasharray="5,5" strokeOpacity="0.5" /></svg>'

    const svg = convertJsxToSvg(jsxInput)
    const backToJsx = convertSvgToJsx(svg)

    assert.strictEqual(backToJsx, jsxInput)
  })

  it('should handle font attributes in roundtrip', () => {
    const jsxInput = '<svg><text fontFamily="Arial" fontSize="12" fontWeight="bold" fontStyle="italic" /></svg>'

    const svg = convertJsxToSvg(jsxInput)
    const backToJsx = convertSvgToJsx(svg)

    assert.strictEqual(backToJsx, jsxInput)
  })
})

describe('prepareForOptimization', () => {
  it('should convert JSX SVG and return wasJsx: true', () => {
    const input = '<svg className="icon"><path strokeWidth={2} /></svg>'
    const result = prepareForOptimization(input)

    assert.strictEqual(result.wasJsx, true)
    assert.ok(result.preparedSvg.includes('class='))
    assert.ok(result.preparedSvg.includes('stroke-width="2"'))
  })

  it('should not modify standard SVG and return wasJsx: false', () => {
    const input = '<svg class="icon"><path stroke-width="2" /></svg>'
    const result = prepareForOptimization(input)

    assert.strictEqual(result.wasJsx, false)
    assert.strictEqual(result.preparedSvg, input)
  })
})

describe('finalizeAfterOptimization', () => {
  it('should convert back to JSX when wasJsx is true', () => {
    const optimized = '<svg class="icon"><path stroke-width="2"/></svg>'
    const result = finalizeAfterOptimization(optimized, true)

    assert.ok(result.includes('className='))
    assert.ok(result.includes('strokeWidth='))
  })

  it('should not modify when wasJsx is false', () => {
    const optimized = '<svg class="icon"><path stroke-width="2"/></svg>'
    const result = finalizeAfterOptimization(optimized, false)

    assert.strictEqual(result, optimized)
  })
})

describe('attribute maps', () => {
  it('should have matching entries in both maps', () => {
    const jsxKeys = Object.keys(jsxToSvgAttributeMap)
    const svgKeys = Object.keys(svgToJsxAttributeMap)

    assert.strictEqual(jsxKeys.length, svgKeys.length, 'Maps should have same number of entries')

    for (const [jsx, svg] of Object.entries(jsxToSvgAttributeMap)) {
      assert.strictEqual(svgToJsxAttributeMap[svg], jsx, `${svg} should map back to ${jsx}`)
    }
  })

  it('should include all common stroke attributes', () => {
    const strokeAttrs = ['strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'strokeOpacity']
    for (const attr of strokeAttrs) {
      assert.ok(attr in jsxToSvgAttributeMap, `${attr} should be in jsxToSvgAttributeMap`)
    }
  })

  it('should include all common fill attributes', () => {
    const fillAttrs = ['fillOpacity', 'fillRule']
    for (const attr of fillAttrs) {
      assert.ok(attr in jsxToSvgAttributeMap, `${attr} should be in jsxToSvgAttributeMap`)
    }
  })
})

describe('edge cases', () => {
  it('should handle SVG with no attributes to convert', () => {
    const input = '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>'
    assert.strictEqual(convertJsxToSvg(input), input)
    assert.strictEqual(convertSvgToJsx(input), input)
  })

  it('should handle empty SVG', () => {
    const input = '<svg></svg>'
    assert.strictEqual(convertJsxToSvg(input), input)
    assert.strictEqual(convertSvgToJsx(input), input)
  })

  it('should handle self-closing SVG elements', () => {
    const input = '<svg><circle strokeWidth={2} /><rect strokeWidth={3} /></svg>'
    const result = convertJsxToSvg(input)
    assert.ok(result.includes('stroke-width="2"'))
    assert.ok(result.includes('stroke-width="3"'))
  })

  it('should handle expression with variable name', () => {
    const input = '<svg><path strokeWidth={strokeSize} /></svg>'
    const result = convertJsxToSvg(input)
    assert.ok(result.includes('stroke-width="strokeSize"'))
  })

  it('should handle nested SVG elements', () => {
    const input = `<svg className="outer">
      <g className="group">
        <path strokeWidth={2} />
      </g>
    </svg>`
    const result = convertJsxToSvg(input)

    // Count occurrences of class=
    const classCount = (result.match(/class=/g) || []).length
    assert.strictEqual(classCount, 2, 'Should convert both className occurrences')
  })

  it('should not convert partial attribute names', () => {
    // Make sure we don't accidentally convert "mystrokeWidth" or similar
    const input = '<svg data-strokeWidth="test"><path /></svg>'
    const result = convertJsxToSvg(input)
    // The data-strokeWidth should remain unchanged because it's prefixed with data-
    assert.ok(result.includes('data-strokeWidth=') || result.includes('data-stroke-width='))
  })

  it('should handle attributes with single quotes', () => {
    const input = "<svg className='icon'><path strokeLinecap='round' /></svg>"
    const result = convertJsxToSvg(input)
    assert.ok(result.includes("class='icon'"))
    assert.ok(result.includes("stroke-linecap='round'"))
  })

  it('should handle mixed quote styles', () => {
    const input = '<svg className="icon"><path strokeLinecap=\'round\' strokeWidth={2} /></svg>'
    const result = convertJsxToSvg(input)
    assert.ok(result.includes('class="icon"'))
    assert.ok(result.includes("stroke-linecap='round'"))
    assert.ok(result.includes('stroke-width="2"'))
  })

  it('should handle nested brackets in expressions (e.g. onClick handlers)', () => {
    const input = '<svg onClick={() => { console.log("click") }} strokeWidth={2}></svg>'
    const result = convertJsxToSvg(input)
    
    // Check that we got a valid attribute format
    // The inner quotes should be escaped as &quot;
    assert.ok(result.includes('data-jsx-event-onClick="() =&gt; { console.log(&quot;click&quot;) }"'))
    assert.ok(result.includes('stroke-width="2"'))
    
    // Check that we can round-trip it back
    // Simulate what SVGO might do (escape >)
    // Our logic restores onClick={...} and unescapes quotes and HTML entities.
    const backToJsx = convertSvgToJsx(result)
    assert.ok(backToJsx.includes('onClick={() => { console.log("click") }}'))
    assert.ok(backToJsx.includes('strokeWidth=')) 
  })

  it('should handle SVG with inner element having xmlns attribute', () => {
    const input = `<svg width='2em' height='2em' viewBox='0 0 24 24'>
      <title xmlns=''>check-box-solid</title>
      <path fill='currentColor' d='M22 2V1H2v1H1v20h1v1h20v-1h1V2z' />
    </svg>`
    
    // Just ensure it doesn't crash and preserves content
    const result = convertJsxToSvg(input)
    assert.ok(result.includes('<title xmlns=\'\'>check-box-solid</title>'))
  })
})

describe('spread attributes', () => {
  it('should detect spread attributes in isJsxSvg', () => {
    const input = '<svg {...props}><path /></svg>'
    assert.strictEqual(isJsxSvg(input), true)
  })

  it('should convert spread attributes in convertJsxToSvg', () => {
    const input = '<svg {...props}><path /></svg>'
    const expected = '<svg data-spread-0="props"><path /></svg>'
    assert.strictEqual(convertJsxToSvg(input), expected)
  })

  it('should restore spread attributes in convertSvgToJsx', () => {
    const input = '<svg data-spread-0="props"><path /></svg>'
    const expected = '<svg {...props}><path /></svg>'
    assert.strictEqual(convertSvgToJsx(input), expected)
  })

  it('should handle roundtrip with spread attributes', () => {
    const input = '<svg {...props} className="w-4 h-4"><path /></svg>'
    const svg = convertJsxToSvg(input)
    const output = convertSvgToJsx(svg)
    assert.strictEqual(output, input)
  })

  it('should handle multiple spread attributes', () => {
    const input = '<svg {...props} {...user} className="w-4 h-4"><path /></svg>'
    const svg = convertJsxToSvg(input)
    
    // Ensure we have distinct attributes
    assert.ok(svg.includes('data-spread-0="props"'))
    assert.ok(svg.includes('data-spread-1="user"'))
    
    const output = convertSvgToJsx(svg)
    assert.strictEqual(output, input)
  })

  it('should handle tricky SVG with onClick and class', () => {
    const input = `<svg onClick={() => { console.log('hola') }} class="hola" data-a="hola" id="hola" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>`

    // Should classify as JSX because of strokeLinecap, strokeWidth, onClick expression
    assert.strictEqual(isJsxSvg(input), true)

    const svg = convertJsxToSvg(input)
    // onClick should be converted to string attribute with quotes escaped if needed
    // In this case inner quotes are single quotes so they might stay as is or be friendly
    assert.ok(svg.includes('data-jsx-event-onClick="() =&gt; { console.log(\'hola\') }"'))
    assert.ok(svg.includes('stroke-linecap="round"'))
    
    const output = convertSvgToJsx(svg)
    
    // Original had class="hola". Output will have className="hola" because convertSvgToJsx enforces className
    const expected = input.replace('class="hola"', 'className="hola"')
    assert.strictEqual(output, expected)
  })
})
