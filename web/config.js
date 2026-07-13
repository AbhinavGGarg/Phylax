// PHYLAX hosted runtime config. The anon key is the PUBLIC, browser-safe key
// (Row-Level Security protects data); this is the standard InsForge frontend pattern.
// The console + partner pages read window.PHYLAX to call the InsForge edge functions
// directly, so the same static bundle works locally and on InsForge Sites.
window.PHYLAX = {
  base: "https://kd6vibk3.us-east.insforge.app",
  anon: "anon_647031aac55606bf15a28d73ac4c6828d93825133591f8023aaf2fb7402be958"
};
