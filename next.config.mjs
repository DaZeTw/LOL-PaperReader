/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for canvas dependency in pdfjs-dist
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      // Redirect pdfjs-dist mjs imports to js files
      'pdfjs-dist/build/pdf.mjs': 'pdfjs-dist/build/pdf.js',
    }

    if (isServer) {
      // Disable pdfjs worker loading on server-side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        'pdfjs-dist/build/pdf.worker.js': false,
        'pdfjs-dist/build/pdf.worker.mjs': false,
      }
    }

    if (!isServer) {
      config.externals = config.externals || []
      config.externals.push({
        canvas: 'canvas',
      })
    }

    // Fix for pdfjs-dist module resolution
    config.module = config.module || {}
    config.module.rules = config.module.rules || []

    config.module.rules.push({
      test: /\.m?js$/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false,
      },
    })

    return config
  },
}

export default nextConfig
