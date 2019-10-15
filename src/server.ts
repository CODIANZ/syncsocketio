import Express = require("express");
import Socketio = require("socket.io");
import Http = require("http");
import * as path from "path";
import { SyncSocketIO } from "./syncsocket";

const express = Express();
const http = Http.createServer(express);
const socketio = Socketio(http);

express.use(Express.static(path.resolve(__dirname, "../html")));

socketio.on("connect", (ss: Socketio.Socket)=>{
  const s = new SyncSocketIO(ss);
  s.on("message", (m: string)=>{
    console.log(m);
    s.emit("response", `response ${m}`)
    .then(()=>{
      console.log("send successful");
    })
    .catch((err)=>{
      console.error(`send error ${err}`);
    });
  });

  s.onSolcitedMessage("message", (index, body)=>{
    console.log(`solicited message : (${index})`);
    setTimeout(()=>{
      s.emitSolicitedResponse(index, "response", `response ${body}`)
      .then(()=>{
        console.log(`send solicited response successful (${index})`);
      })
      .catch((err)=>{
        console.error(`send solicited response error ${err}`);
      });
    }, 5000);
    setTimeout(()=>{
      const m = `${new Date()}`;
      console.log(`send solicited message ${m}`);
      s.emitSolicitedMessageAndWaitResponse("message", m)
      .then((x)=>{
        console.log(`send & receive solicited message successful (${JSON.stringify(x)})`);
      })
      .catch((err)=>{
        console.error(`send & receive solicited message error ${err}`);
      });
    }, 1000);
  });
});


http.listen(50080, "localhost", ()=>{
  console.log("server running");
});

