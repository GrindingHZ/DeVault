/* Vite hands an imported asset back as the url it serves it from. This
   package's tsconfig includes it with the rest of src; the apps that consume
   the package get the same declaration from vite/client. */
declare module '*.svg' {
  const url: string;
  export default url;
}
