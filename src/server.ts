import Express = require("express");
import Socketio = require("socket.io");
import Http = require("http");
import * as path from "path";
import { SyncSocket } from "./syncsocket";

const express = Express();
const http = Http.createServer(express);
const socketio = Socketio(http);

express.use(Express.static(path.resolve(__dirname, "../html")));

socketio.on("connect", (ss: Socketio.Socket)=>{
  const s = new SyncSocket(ss);
  s.on("message", (m: string)=>{
    console.log(m);
    s.emit("response", `response ${m}`)
    .then(()=>{
      console.log("send success");
    })
  });
});


http.listen(50080, "localhost", ()=>{
  console.log("server running");
});

