import Socketio = require("socket.io");
import { of, Subject, never } from 'rxjs';
import { mergeMap, take } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';

type messageType_t = "solicitedMessage" | "solicitedResponse" | "unsolicitedMessage";

type message_t = {
  index:  number,                     /* "number" is it sender specify sequential  */
  type:   messageType_t,              /* "type" is a message "solicited" or "unsolicited" */
  solicitedMessgeIndex?: number,      /* the number which is the index of "solicitedMessage" for "solicitedResponse" */
  event:  string,                     /* "event which uses socket.io */
  body:   string                      /* "body" which uses socket.io */
};

type ack_t = {
  index: number;
}

export class SyncSocketIO {
  private m_socketio: Socketio.Socket | SocketIOClient.Socket;
  private m_sessionId: string;
  private m_messageIndex: number = 0;
  private m_lastReceiveMessageIndex: number = 0;
  private m_ackMessage = new Subject<ack_t>();
  private m_message = new Subject<message_t>();

  public get SessionId() { return this.m_sessionId; }

  private static s_sockets: {[_:string]: SyncSocketIO} = {};

  /* サーバ側の接続待機 */
  public static waitForConnecting(server: Socketio.Server, onConnect: (syncSocket: SyncSocketIO) => void){
    server.on("connect", (s)=>{
      s.once("$hello", (id: string) =>{
        if(id in SyncSocketIO.s_sockets){
          const ssio = SyncSocketIO.s_sockets[id];
          ssio.m_socketio.removeAllListeners();
          ssio.m_socketio.disconnect();
          ssio.m_socketio = s;
          ssio.prepareObservers();
        }
        else{
          const ssio = new SyncSocketIO(s, id);
          SyncSocketIO.s_sockets[id] = ssio;
          onConnect(ssio);
        }
      });
    });
  }

  /* クライアントからの接続 */
  public static connect(socket: SocketIOClient.Socket){
    const sessionId = uuid();
    const ss = new SyncSocketIO(socket, sessionId);
    ss.helloOnConnect();
    return ss;
  }

  public helloOnConnect() {
    this.m_socketio.on("connect", ()=>{
      this.m_socketio.emit("$hello", this.m_sessionId);
    });
  }

  public goodbye() {
    this.log("goodbye")
    if(this.m_sessionId in SyncSocketIO.s_sockets){
      delete SyncSocketIO.s_sockets[this.m_sessionId];
      this.subjectsBroadcastError("goodbye");
      this.m_socketio.removeAllListeners();
      this.m_socketio.disconnect();
    }
    else{
      this.subjectsBroadcastError("goodbye");
      this.m_socketio.removeAllListeners();
      this.m_socketio.disconnect();
    }
  }

  private subjectsBroadcastError(reason: string){
    this.m_ackMessage.error(new Error(reason));
    this.m_message.error(new Error(reason));
  }

  private constructor(socketio: Socketio.Socket | SocketIOClient.Socket, sessionId: string){
    this.m_sessionId = sessionId;
    this.m_socketio  = socketio;
    this.log(`ctor sessionId = ${sessionId}`);
    this.prepareObservers();
  }

  private prepareObservers(){
    this.m_socketio.on("$ack", (ack: ack_t)=>{
      this.m_ackMessage.next(ack);
    });

    this.m_socketio.on("$message", (message: message_t)=>{
      const ack: ack_t = {
        index: message.index
      };
      this.m_socketio.emit("$ack", ack);
      if(message.index != this.m_lastReceiveMessageIndex){
        this.m_lastReceiveMessageIndex = message.index;
        this.log(`receive (${message.index})`);
        this.m_message.next(message);
      }
      else{
        this.log(`receive (${message.index}) : already received`);
      }
    });    
  }

  private log(s: string){
    console.log(`[${this.m_sessionId}:${this.m_socketio.id}] ${s}`);
  }

  public onUnsolicitedMessage(event: string, f:(_:any)=>void){
    this.m_message
    .pipe(mergeMap((x)=>{
      if(x.type != "unsolicitedMessage") return never();
      if(x.event != event) return never();
      return of(x);
    }))
    .subscribe((x)=>{
      f(x.body);
    });
  }

  public onSolcitedMessage(event: string, f:(index: number, _:any)=>void){
    this.m_message
    .pipe(mergeMap((x)=>{
      if(x.type != "solicitedMessage") return never();
      if(x.event != event) return never();
      return of(x);
    }))
    .subscribe((x)=>{
      f(x.index, x.body);
    });
  }

  public emitUnsolicitedMessage(event: string, body: any){
    return this.emitInternal(event, body, "unsolicitedMessage");
  }

  public emitSolicitedResponse(index: number, event: string, body: any){
    return this.emitInternal(event, body, "solicitedResponse", index);
  }

  public emitSolicitedMessageAndWaitResponse(event: string, body: any){
    return new Promise((resolve, reject)=>{
      const targetIndex = this.m_messageIndex + 1;
      this.m_message
      .pipe(mergeMap((x)=>{
        if(x.type != "solicitedResponse") return never();
        if(x.solicitedMessgeIndex != targetIndex) return never();
        return of(x);
      }))
      .pipe(take(1))
      .subscribe((x)=>{
        resolve({event: event, body: x.body});
      },
      (err)=>{
        reject(err)
      },
      () => {
      });
      this.emitInternal(event, body, "solicitedMessage");
    });
  }

  private emitInternal(event: string, body: any, type: messageType_t, solicitedMessgeIndex?: number){
    this.m_messageIndex++;
    const index = this.m_messageIndex;
    this.log(`emit (${index})`);

    return new Promise((resolve, reject)=>{
      const message: message_t = {
        index:  index,
        type:   type,
        solicitedMessgeIndex: solicitedMessgeIndex,
        event:  event,
        body:   body
      };
      const timer = setInterval(()=>{
        this.log(`emit (${index}) : retry`);
        this.m_socketio.emit("$message", message);
      }, 1000);

      this.m_ackMessage
      .pipe(mergeMap((x)=>{
        if(x.index == index){
          return of(x);
        }
        return never();
      }))
      .pipe(take(1))
      .subscribe(()=>{
        clearInterval(timer);
        this.log(`emit (${index}) : success`);
        resolve(index);
      },
      (err)=>{
        this.log(`emit (${index}) : error`);
        reject(err);
      },
      ()=>{
      });
  
      this.log(`emit (${index}) : send`);
      this.m_socketio.emit("$message", message);
    });
  }
}