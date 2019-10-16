import Express = require("express");
import SocketIO = require("socket.io");
import Http = require("http");
import * as path from "path";
import { SyncSocketIO } from "./syncsocketio";

const express = Express();
const http = Http.createServer(express);
const socketIO = SocketIO(http);

express.use(Express.static(path.resolve(__dirname, "../html")));

SyncSocketIO.waitForConnecting(socketIO, (syncsocketio)=>{
  syncsocketio.onUnsolicitedMessage("message", (m: string)=>{
    console.log(m);
    syncsocketio.emitUnsolicitedMessage("response", `response ${m}`)
    .then(()=>{
      console.log("send successful");
    })
    .catch((err)=>{
      console.error(`send error ${err}`);
    });
  });

  syncsocketio.onSolcitedMessage("message", (index, body)=>{
    console.log(`solicited message : (${index})`);
    setTimeout(()=>{
      syncsocketio.emitSolicitedResponse(index, "response", `response ${body}`)
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
      syncsocketio.emitSolicitedMessageAndWaitResponse("message", m)
      .then((x)=>{
        console.log(`send & receive solicited message successful (${JSON.stringify(x)})`);
      })
      .catch((err)=>{
        console.error(`send & receive solicited message error ${err}`);
      });
    }, 1000);
  });
});


http.listen(50080, "192.168.4.17", ()=>{
  console.log("server running");
});

