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
  webpack: (config) => {
    // Fix for canvas dependency in pdfjs-dist
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    }

    config.externals = config.externals || []
    config.externals.push({
      canvas: 'canvas',
    })

    return config
  },
}

export default nextConfig
