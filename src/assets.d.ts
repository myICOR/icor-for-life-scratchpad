/* esbuild's dataurl loader (esbuild.config.mjs) turns a .png import into
   its data: URL string at build time. */
declare module '*.png' {
  const dataUrl: string;
  export default dataUrl;
}
