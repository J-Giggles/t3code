import * as NodeHttp from "node:http";

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value ?? fallback;
}

const host = readArg("--host", process.env.HOST ?? "127.0.0.1");
const port = Number.parseInt(readArg("--port", process.env.PORT ?? "0"), 10);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("dev-server.mjs requires --port <positive integer>.");
}

const server = NodeHttp.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }

  response.writeHead(200, { "content-type": "text/html" });
  response.end(`
    <!doctype html>
    <html>
      <head><title>T3 Code E2E Dev App</title></head>
      <body>
        <main>
          <h1>T3 Code E2E Dev App</h1>
          <p>URL: ${request.url ?? "/"}</p>
        </main>
      </body>
    </html>
  `);
});

server.listen(port, host, () => {
  console.log(`E2E dev server listening on http://${host}:${port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
