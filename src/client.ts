import "jquery";
import socketio from "socket.io-client";


$(document).ready(()=>{
  $("#hello").on("click", ()=>{

    let s = socketio(`${location.host}`);
    s.on("response", (m: string)=>{
      alert(m);
    });
    s.on("connect", ()=>{
      s.emit("reqest", "foo");
    });
  });
});