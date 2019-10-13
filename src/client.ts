import "jquery";
import socketio from "socket.io-client";
import { SyncSocket } from "./syncsocket";


$(document).ready(()=>{
  $("#hello").on("click", ()=>{

    let ss = socketio(`${location.host}`);
    const s = new SyncSocket(ss, false);
    s.on("response", (m: string)=>{
      alert(m);
    });
    s.on("connect", ()=>{
      s.hello()
      .then(()=>{
        return s.emit("reqest", "foo")
      })
      .then(()=>{
        console.log("send success");
      });
  });
  });
});