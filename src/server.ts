import Express = require("express");
import Socketio = require("socket.io");
import Http = require("http");
import * as path from "path";


const express = Express();
const http = Http.createServer(express);
const socketio = Socketio(http);

express.use(Express.static(path.resolve(__dirname, "../html")));

socketio.on("connect", (s: Socketio.Socket)=>{
  s.on("reqest", (m: string)=>{
    console.log(m);
    s.emit("response", m);
  });
});


http.listen(50080, "localhost", ()=>{
  console.log("server running");
});

