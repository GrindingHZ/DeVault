/* Vite hands an imported asset back as the url it serves it from. Referenced
   from the component that imports one, so every compile that reaches the
   component reaches this. */
declare module '*.svg' {
  const url: string;
  export default url;
}
