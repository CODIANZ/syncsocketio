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
    g_socket.onSolcitedMessage("message", (index, body)=>{
      log(`[receive] solicited message (${index}) ${body}`);
      setTimeout(()=>{
        g_socket!.emitSolicitedResponse(index, "response", `response ${body}`)
        .then(()=>{
          log(`[send] solicited response successful (${index})`);
        })
        .catch((err)=>{
          log(`[send] solicited response error ${err}`);
        });
      }, 5000);
    });

    g_socket.on("connect", ()=>{
      g_socket!.hello()
      .then((x)=>{
        log(`[hello] ok ${x}`);
      });
    });
  });

  $("#emit-unsolicited").on("click", ()=>{
    if(!g_socket){
      log(`[error] socket == null`);
      return;
    }
    g_socket.emit("message", $("#body").val() as string)
    .then((x)=>{
      log(`[send] (${x}) successful`);
    })
    .catch((err)=>{
      log(`[send] error ${err}`);
    });
  });

  $("#emit-solicited").on("click", ()=>{
    if(!g_socket){
      log(`[error] socket == null`);
      return;
    }
    const m = `${new Date()} - ${$("#body").val()}`;
    log(`send solicited message ${m}`);
    g_socket.emitSolicitedMessageAndWaitResponse("message", m)
    .then((x)=>{
      log(`[send&receive] (${JSON.stringify(x)}) successful`);
    })
    .catch((err)=>{
      log(`[send&receive] error ${err}`);
    });
  });
});

function log(s: string){
  $("#log").text($("#log").text() + `${s}\n`);
}