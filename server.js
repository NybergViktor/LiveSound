import { WebSocketServer } from "ws";

const wss = new WebSocketServer({port: 3001 });

let clients = {};

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "register") {
      clients[data.id] = ws;
    } else if (data.type === "signal") {
      if (clients[data.target]) {
        clients[data.target].send(
          JSON.stringify({
            type: "signal",
            signal: data.signal,
            from: data.from,
          })
        );
      }
    }
  });

  ws.on("close", () => {
    Object.keys(clients).forEach((id) => {
      if (clients[id] === ws) delete clients[id];
    });
  });
});

console.log("WebSocket-server runs!");
