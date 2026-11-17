/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // Raise the Server Action request body cap above Next's 1 MB default so a
      // validated image upload can reach the action. The app allows 5 MB images
      // (MAX_IMAGE_BYTES in src/lib/media.ts); base64 encoding inflates the body
      // by ~33% (~6.7 MB), so "8mb" leaves headroom. This is only a transport
      // ceiling — validateImageUpload's 5 MB check stays the authoritative cap.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
