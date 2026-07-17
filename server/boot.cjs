
(async () => {
  try {
    await import("./index.ts");
  } catch (err) {
    console.error("This feature is available in English only.");
    console.error(err.stack);
    process.exit(1);
  }
})();
