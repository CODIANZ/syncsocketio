import Socketio = require("socket.io");
import { of, Subject, never } from 'rxjs';
import { mergeMap, take, retryWhen, timeout, timeoutWith } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';

type message_t = {
  index: number,
  event: string | symbol,
  body: string
};

type ack_t = {
  index: number;
}

type hello_t = {
  sessionId: string;
}

const reserved_events = [
  "connect",
  "connection", /* server only */
  "error",
  "disconnect",
  "reconnect",
  "reconnect_attempt",
  "reconnecting",
  "reconnect_error",
  "reconnect_failed"
];

export class SyncSocket {
  private m_socketio: Socketio.Socket | SocketIOClient.Socket;
  private m_sessionId: string = "(unknown)";
  private m_messageIndex: number = 0;
  private m_lastReceiveMessageIndex: number = 0;
  private m_ackMessage = new Subject<ack_t>();
  private m_message = new Subject<message_t>();
  private m_ackHello = new Subject<string>();
  private m_bPassthru:boolean;

  public get RawSocket() { return this.m_socketio; }
  public get SessionId() { return this.m_sessionId; }

  constructor(socketio: Socketio.Socket | SocketIOClient.Socket, bPassthuru: boolean = false){
    this.m_socketio = socketio;
    this.m_bPassthru = bPassthuru;

    if(this.m_bPassthru){
      this.log("construct with passthru");
      return;
    }

    this.m_socketio.on("$ack", (ack: ack_t)=>{
      this.m_ackMessage.next(ack);
    });

    this.m_socketio.on("$hello", (id: string)=>{
      this.log(`hello: ${id}`);
      this.m_sessionId = id;
      this.m_socketio.emit("$hello-ack", id);
    });

    this.m_socketio.on("$hello-ack", (id: string)=>{
      this.m_ackHello.next(id);
    });

    this.m_socketio.on("$message", (message: message_t)=>{
      this.log(`receive (${message.index})`);
      const ack: ack_t = {
        index: message.index
      };
      this.m_socketio.emit("$ack", ack);
      if(message.index != this.m_lastReceiveMessageIndex){
        this.m_lastReceiveMessageIndex = message.index;
        this.log(`receive (${message.index}) : proceed`);
        this.m_message.next(message);
      }
      else{
        this.log(`receive (${message.index}) :already proceeded`);
      }
    });
  }

  private log(s: string){
    console.log(`[${this.m_sessionId}] ${s}`);
  }

  public hello(){
    this.m_sessionId = uuid();
    return new Promise((resolve, reject)=>{

      if(this.m_bPassthru){
        resolve(this.m_sessionId);
        return;
      }
  
      const timer = setInterval(()=>{
        this.log(`hello : retry`);
        this.m_socketio.emit("$hello", this.m_sessionId);
      }, 1000);

      this.m_ackHello
      .pipe(mergeMap((x)=>{
        if(x == this.m_sessionId){
          return of(void 0);
        }
        return never();
      }))
      .pipe(take(1))
      .subscribe(()=>{
        clearTimeout(timer);
        resolve(this.m_sessionId);
      },
      (err)=>{
        reject(err);
      },
      ()=>{
      });
      this.log(`hello : send`);
      this.m_socketio.emit("$hello", this.m_sessionId);
    });
  }

  public on(event: string, f:(_:any)=>void){
    if(this.m_bPassthru || (reserved_events.indexOf(event) >= 0)){
      this.m_socketio.on(event, (x)=>{
        f(x);
      });
      return;
    }
    this.m_message
    .pipe(mergeMap((x)=>{
      if(x.event == event){
        return of(x);
      }
      return never();
    }))
    .subscribe((x)=>{
      f(x.body);
    });
  }

  public emit(event: string, body: any){
    this.m_messageIndex++;
    const index = this.m_messageIndex;
    this.log(`emit (${index})`);

    return new Promise((resolve, reject)=>{
      if(this.m_bPassthru){
        this.m_socketio.emit(event, body);
        resolve(this.m_messageIndex);
        return;
      }

      const message: message_t = {
        index: index,
        event: event,
        body: body
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
        reject(err)
      },
      ()=>{
      });
  
      this.log(`emit (${index}) : send`);
      this.m_socketio.emit("$message", message);
    });
  }
}