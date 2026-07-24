import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function hasPackage(id: string, pkg: string) {
  return id.includes(`/node_modules/${pkg}/`)
}

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return

  const normalizedId = id.replace(/\\/g, '/')

  if (
    ['react', 'react-dom', 'scheduler'].some((pkg) =>
      hasPackage(normalizedId, pkg),
    )
  ) {
    return 'vendor-react'
  }

  if (hasPackage(normalizedId, 'react-router')) {
    return 'vendor-router'
  }

  if (
    [
      '@supabase/supabase-js',
      '@supabase/auth-js',
      '@supabase/postgrest-js',
      '@supabase/realtime-js',
      '@supabase/storage-js',
      '@supabase/functions-js',
    ].some((pkg) => hasPackage(normalizedId, pkg))
  ) {
    return 'vendor-supabase'
  }

  if (
    [
      'lucide-react',
      're-resizable',
    ].some((pkg) => hasPackage(normalizedId, pkg))
  ) {
    return 'vendor-ui'
  }

  if (
    ['react-dnd', 'react-dnd-html5-backend', 'dnd-core'].some((pkg) =>
      hasPackage(normalizedId, pkg),
    )
  ) {
    return 'vendor-dnd'
  }

  return 'vendor'
}

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used - do not remove them.
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(rootDir, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
