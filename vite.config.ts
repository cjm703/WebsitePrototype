import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

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
      '@mui/material',
      '@mui/icons-material',
      '@emotion/react',
      '@emotion/styled',
      '@emotion/cache',
      '@emotion/serialize',
      '@emotion/utils',
      '@popperjs/core',
    ].some((pkg) => hasPackage(normalizedId, pkg))
  ) {
    return 'vendor-mui'
  }

  if (
    [
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      'class-variance-authority',
      'clsx',
      'cmdk',
      'embla-carousel-react',
      'input-otp',
      'lucide-react',
      'next-themes',
      're-resizable',
      'react-day-picker',
      'react-hook-form',
      'react-popper',
      'react-resizable-panels',
      'react-responsive-masonry',
      'sonner',
      'tailwind-merge',
      'vaul',
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

  if (
    ['date-fns', 'recharts', 'victory-vendor'].some((pkg) =>
      hasPackage(normalizedId, pkg),
    )
  ) {
    return 'vendor-data'
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
      '@': path.resolve(__dirname, './src'),
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
