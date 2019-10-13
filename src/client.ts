import "jquery";
import socketio from "socket.io-client";
import { SyncSocket } from "./syncsocket";

let g_socket: SyncSocket | undefined;

$(document).ready(()=>{
  $("#hello").on("click", ()=>{
    let ss = socketio(`${location.host}`);
    g_socket = new SyncSocket(ss);
    g_socket.on("response", (m: string)=>{
      log(`[response] ${m}`);
    });
    g_socket.on("connect", ()=>{
      g_socket!.hello()
      .then((x)=>{
        log(`[hello] ok ${x}`);
      });
    });
  });

  $("#emit").on("click", ()=>{
    if(!g_socket){
      log(`[error] socket == null`);
      return;
    }
    g_socket.emit("message", $("#body").val() as string)
    .then((x)=>{
      log(`[send] (${x}) success`);
    })
    .catch((err)=>{
      log(`[send] error ${err}`);
    });
  });
});

function log(s: string){
  $("#log").text($("#log").text() + `${s}\n`);
}