import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // These modules must be externalized for the server build (like Route Handlers)
    // because they contain C++ or binary code that cannot be bundled.
    serverExternalPackages: [
        'hnswlib-node',
        'faiss-napi',
    ]
};

export default nextConfig;
