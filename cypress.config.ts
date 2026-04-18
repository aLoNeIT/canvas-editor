import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  viewportWidth: 1366,
  viewportHeight: 720,
  e2e: {
    baseUrl: 'http://127.0.0.1:8100/canvas-editor/index.html',
    supportFile: false,
    experimentalRunAllSpecs: true
  }
})
