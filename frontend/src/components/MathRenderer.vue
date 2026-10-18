<script setup>
import { onMounted, ref, watch } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

const props = defineProps({
  content: { type: String, default: '' },
  inline: { type: Boolean, default: false }
})

const container = ref(null)

const latexKeywords = [
  'frac', 'sqrt', 'sum', 'prod', 'int', 'lim', 'pm', 'times', 'div', 'cdot', 
  'approx', 'equiv', 'ne', 'le', 'ge', 'infty', 'partial', 'nabla', 
  'sin', 'cos', 'tan', 'log', 'ln', 
  'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'pi', 'sigma', 'omega', 
  'Delta', 'Gamma', 'Lambda', 'Pi', 'Sigma', 'Omega', 
  'begin', 'rightarrow', 'leftarrow', 'cup', 'cap', 'subset', 'in'
]

const escapeHtml = (text) => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

const renderMath = () => {
  if (!container.value) return
  if (!props.content) {
    container.value.innerHTML = ''
    return
  }

  const content = props.content
  
  // Standard delimiters regex
  // $$...$$ | \[...\] | $...$ | \(...\)
  const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\))/g
  
  // Check if standard delimiters exist
  const hasDelimiters = regex.test(content)
  
  // If no delimiters found, try smart detection for raw LaTeX
  if (!hasDelimiters) {
    if (content.includes('\\')) {
      const hasKeyword = latexKeywords.some(k => content.includes('\\' + k))
      // Also check for common operators that might appear without backslash in raw text but imply math
      // e.g. "^", "_" (but be careful with text)
      // For now, strictly require a backslash keyword to avoid false positives
      
      if (hasKeyword) {
        try {
          // Try to render the whole content as math
          // Use displayMode if it looks long or contains line breaks
          const isDisplay = content.includes('\\\\') || content.length > 50
          const rendered = katex.renderToString(content, { 
            displayMode: isDisplay, 
            throwOnError: true // Throw error to fallback to text if invalid (e.g. contains Chinese)
          })
          container.value.innerHTML = rendered
          return
        } catch (e) {
          // Fallback to normal text rendering if KaTeX fails
        }
      }
    }
  }

  // Normal processing (splitting by delimiters)
  regex.lastIndex = 0
  let lastIndex = 0
  let html = ''
  let match
  
  while ((match = regex.exec(content)) !== null) {
    // Text before match
    const text = content.slice(lastIndex, match.index)
    html += escapeHtml(text)
    
    // Math content
    const fullMatch = match[0]
    let math = ''
    let displayMode = false
    
    if (fullMatch.startsWith('$$')) {
      math = fullMatch.slice(2, -2)
      displayMode = true
    } else if (fullMatch.startsWith('\\[')) {
      math = fullMatch.slice(2, -2)
      displayMode = true
    } else if (fullMatch.startsWith('$')) {
      math = fullMatch.slice(1, -1)
      displayMode = false
    } else if (fullMatch.startsWith('\\(')) {
      math = fullMatch.slice(2, -2)
      displayMode = false
    }
    
    try {
      html += katex.renderToString(math, { displayMode, throwOnError: false })
    } catch (e) {
      html += escapeHtml(fullMatch)
    }
    
    lastIndex = regex.lastIndex
  }
  
  // Remaining text
  html += escapeHtml(content.slice(lastIndex))
  
  // Convert newlines to <br> for text parts
  html = html.replace(/\n/g, '<br>')
  
  container.value.innerHTML = html
}

watch(() => props.content, renderMath)
onMounted(renderMath)
</script>

<template>
  <div ref="container" class="math-renderer" :style="{ display: inline ? 'inline-block' : 'block' }"></div>
</template>

<style>
.math-renderer {
  font-family: v-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  line-height: 1.6;
}
.katex { font-size: 1.1em; }
</style>
