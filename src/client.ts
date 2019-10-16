import "jquery";
import socketio from "socket.io-client";
import { SyncSocketIO } from "./syncsocketio";

let g_socket: SyncSocketIO | undefined;

$(document).ready(()=>{
  $("#hello").on("click", ()=>{
    const ss = socketio(`${location.host}`);
    g_socket = SyncSocketIO.connect(ss);

    g_socket.onUnsolicitedMessage("response", (m: string)=>{
      log(`[response] ${m}`);
    });

    g_socket.onSolcitedMessage("message", (index, body)=>{
      log(`[receive] solicited message (${index}) ${body}`);
      setTimeout(()=>{
        if(!g_socket){
          log(`socket == null`);
          return;
        }
        g_socket!.emitSolicitedResponse(index, "response", `response ${body}`)
        .then(()=>{
          log(`[send] solicited response successful (${index})`);
        })
        .catch((err)=>{
          log(`[send] solicited response error ${err}`);
        });
      }, 5000);
    });

    $("#goodbye").on("click", ()=>{
      if(g_socket){
        g_socket.emitUnsolicitedMessage("sayonara!")
        .then(()=>{
          if(g_socket){
            g_socket.goodbye();
          }
          g_socket = undefined;
        })
        .catch((err)=>{
          log(`[goodbye] error ${err}`);
        });
      }
    });
  });

  $("#emit-unsolicited").on("click", ()=>{
    if(!g_socket){
      log(`socket == null`);
      return;
    }
    g_socket.emitUnsolicitedMessage("message", $("#body").val() as string)
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