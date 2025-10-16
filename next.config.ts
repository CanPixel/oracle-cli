import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // 💀 TURBOPACK/WEBPACK CONFIGURATION FOR NATIVE MODULES 💀
    // These modules must be externalized for the server build (like Route Handlers)
    // because they contain C++ or binary code that cannot be bundled.
    serverExternalPackages: [
        'hnswlib-node',
        'faiss-napi',
    ],
    
    // Optional: Enable Turbopack for faster local development
    // Remove if you encounter persistent Turbopack errors
    experimental: {
        // This is necessary if you are running `next dev --turbopack`
        // but often `serverExternalPackages` handles the issue without it.
        // turbopack: {
        //     // ... other turbopack config
        // },
    }
    
    /* config options here */
};

export default nextConfig;
