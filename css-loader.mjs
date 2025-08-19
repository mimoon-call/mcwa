// css-loader.mjs
export function load(url, context, defaultLoad) {
    if (url.endsWith('.css')) {
        return {
            format: 'module',
            shortCircuit: true, // ✅ fixes ERR_LOADER_CHAIN_INCOMPLETE
            source: 'export default {};'
        };
    }

    return defaultLoad(url, context, defaultLoad);
}
