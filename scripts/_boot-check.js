/**
 * Boots the real entry point (server/index.js) on a spare port, exercises a few
 * routes over real HTTP, then shuts it down. Scratch tool: node scripts/_boot-check.js
 */
const { spawn } = require("child_process");

const port = 4199;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server/index.js"], {
  cwd: require("path").join(__dirname, ".."),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
const collect = chunk => { output += chunk.toString(); };
child.stdout.on("data", collect);
child.stderr.on("data", collect);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function probe(path, init) {
  try {
    const response = await fetch(base + path, init);
    const text = await response.text();
    return `${response.status} ${path} ${text.slice(0, 140).replace(/\s+/g, " ")}`;
  } catch (error) {
    return `ERR  ${path} ${error.message}`;
  }
}

(async () => {
  for (let waited = 0; waited < 8000 && !output.includes("listening"); waited += 250) await wait(250);
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD })
  }).then(r => r.json()).catch(() => ({}));

  console.log(await probe("/api/health"));
  console.log(await probe("/api/public/config"));
  console.log(await probe("/api/public/incidents"));
  console.log(await probe("/api/nope"));
  console.log(await probe("/api/incidents", { headers: { authorization: `Bearer ${login.token || "none"}` } }));
  console.log(await probe("/api/admin/analytics", { headers: { authorization: `Bearer ${login.token || "none"}` } }));
  console.log("--- server output ---");
  console.log(output.trim());
  child.kill("SIGTERM");
  await wait(500);
  child.kill("SIGKILL");
  process.exit(0);
})();
