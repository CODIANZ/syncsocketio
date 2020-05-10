import Socketio = require("socket.io");
import { of, Subject, never } from 'rxjs';
import { mergeMap, take, map } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';

type messageType_t = "solicitedMessage" | "solicitedResponse" | "unsolicitedMessage";

type message_t = {
  index:  number,                     /* "number" is it sender specify sequential  */
  type:   messageType_t,              /* "type" is a message "solicited" or "unsolicited" */
  solicitedMessgeIndex?: number,      /* the number which is the index of "solicitedMessage" for "solicitedResponse" */
  event:  string,                     /* "event which uses socket.io */
  body:   any                         /* "body" which uses socket.io */
};

type ack_t = {
  index: number;
}

type hello_t = {
  sessionId: string,
  bFirst: boolean
};

type config_t = {
  bEnableLog: boolean,
  timeoutSeconds: number,
  retryIntervalSeconds: number
}

type socketio_t = Socketio.Socket | SocketIOClient.Socket;
//type socketio_t = any;

export class SyncSocketIO {
  private static s_sockets: {[_:string]: SyncSocketIO} = {};
  public static get Sockets() { return SyncSocketIO.s_sockets; }
  public static findBySessionId(sessionId: string){
    if(sessionId in this.Sockets){
      return this.Sockets[sessionId];
    }
    return null;
  }

  private static s_config: config_t = {
    bEnableLog: false,
    timeoutSeconds: 15,
    retryIntervalSeconds: 5
  };
  public set Config(config: config_t) { SyncSocketIO.s_config = config; }
  public get Config() { return SyncSocketIO.s_config; }

  private m_socketio: socketio_t;
  private m_sessionId: string;
  private m_messageIndex: number = 0;
  private m_lastReceiveMessageIndex: number = 0;
  private m_ackMessage = new Subject<ack_t>();
  private m_message = new Subject<message_t>();
  private m_bFirst = false; /* for client */

  private m_pendingSolicitedMessages: {[_:number]: message_t} = {};
  public get PendingSolicitedMessages() { return this.m_pendingSolicitedMessages; }

  private m_tag: any = null;
  public get Tag() { return this.m_tag; }
  public set Tag(tag: any) { this.m_tag = tag; }

  public get SessionId() { return this.m_sessionId; }

  /* サーバ側の接続待機 */
  public static waitForConnecting(server: Socketio.Server, onConnect: (syncSocket: SyncSocketIO) => void){
    server.on("connect", (s)=>{
      s.once("$hello", (hello: hello_t) =>{
        if(hello.sessionId in SyncSocketIO.s_sockets){
          const ssio = SyncSocketIO.s_sockets[hello.sessionId];
          ssio.m_socketio.removeAllListeners();
          ssio.m_socketio.disconnect();
          ssio.m_socketio = s;
          ssio.prepareObservers();
        }
        else{
          if(hello.bFirst){
            const ssio = new SyncSocketIO(s, hello.sessionId);
            SyncSocketIO.s_sockets[hello.sessionId] = ssio;
            onConnect(ssio);
          }
          else{
            s.removeAllListeners();
            s.disconnect();
          }
        }
      });
    });
  }

  /* クライアントからの接続 */
  public static connect(socket: socketio_t){
    const sessionId = uuid();
    const ss = new SyncSocketIO(socket, sessionId);
    socket.on("connect", ()=>{
      const bFirst = ss.m_bFirst;
      ss.m_bFirst = false;
      socket.emit("$hello", <hello_t>{
        sessionId: sessionId,
        bFirst: bFirst
      });
    });

    return ss;
  }

  public goodbye() {
    this.log("goodbye")
    if(this.m_sessionId in SyncSocketIO.s_sockets){
      delete SyncSocketIO.s_sockets[this.m_sessionId];
      this.goodbyeInternal("goodbye");
    }
    else{
      this.goodbyeInternal("goodbye (unmanaged session)");
    }
  }

  private goodbyeInternal(reason: string){
    this.m_socketio.removeAllListeners();
    this.m_socketio.disconnect();
    this.m_ackMessage.error(new Error(reason));
    this.m_message.error(new Error(reason));
  }

  private constructor(socketio: socketio_t, sessionId: string){
    this.m_sessionId = sessionId;
    this.m_socketio  = socketio;
    this.log(`ctor sessionId = ${sessionId}`);
    this.prepareObservers();
    this.m_message
    .pipe(map((x)=>{
      if(x.type == "solicitedMessage"){
        this.m_pendingSolicitedMessages[x.index] = x;
      }
    }))
    .subscribe((x)=>{
    },
    (err)=>{
      this.log(`ctor pendingSolicitedMessage: ${err}`)
    });
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
    if(SyncSocketIO.s_config.bEnableLog){
      console.log(`[${this.m_sessionId}:${this.m_socketio.id}] ${s}`);
    }
  }

  public onUnsolicitedMessage(event: string, f:(body: any)=>void){
    this.m_message
    .pipe(map((x)=>{
      if(x.type != "unsolicitedMessage") return undefined;
      if(x.event != event) return undefined;
      return x;
    }))
    .subscribe((x)=>{
      if(x){
        f(x.body);
      }
    },
    (err)=>{
      this.log(`onUnsolicitedMessage: ${err}`)
    });
  }

  public onSolcitedMessage(event: string, f:(index: number, body: any)=>void){
    this.m_message
    .pipe(map((x)=>{
      if(x.type != "solicitedMessage") return undefined;
      if(x.event != event) return undefined;
      return x;
    }))
    .subscribe((x)=>{
      if(x){
        f(x.index, x.body);
      }
    },
    (err)=>{
      this.log(`onSolcitedMessage: ${err}`)
    });
  }

  public onUnsolicitedMessageRegex(eventExpr: string, f:(event: string, body: any)=>void){
    const expr = new RegExp(eventExpr);
    this.m_message
    .pipe(map((x)=>{
      if(x.type != "unsolicitedMessage") return undefined;
      if(!expr.test(x.event)) return undefined;
      return x;
    }))
    .subscribe((x)=>{
      if(x){
        f(x.event, x.body);
      }
    },
    (err)=>{
      this.log(`onUnsolicitedMessage: ${err}`)
    });
  }

  public onSolcitedMessageRegex(eventExpr: string, f:(index: number, event: string, body: any)=>void){
    const expr = new RegExp(eventExpr);
    this.m_message
    .pipe(map((x)=>{
      if(x.type != "solicitedMessage") return undefined;
      if(!expr.test(x.event)) return undefined;
      return x;
    }))
    .subscribe((x)=>{
      if(x){
        f(x.index, x.event, x.body);
      }
    },
    (err)=>{
      this.log(`onSolcitedMessage: ${err}`)
    });
  }

  public emitUnsolicitedMessage(event: string, body?: any){
    return this.emitInternal(event, body, "unsolicitedMessage");
  }

  public emitSolicitedResponse(index: number, event: string, body?: any){
    if(index in this.m_pendingSolicitedMessages){
      delete this.m_pendingSolicitedMessages[index];
    }
    else{
      this.log(`emitSolicitedResponse missing index ${index}`);
    }
    return this.emitInternal(event, body, "solicitedResponse", index);
  }

  public emitSolicitedMessageAndWaitResponse(event: string, body?: any){
    return new Promise<{event:string, body: string}>((resolve, reject)=>{
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
      this.emitInternal(event, body, "solicitedMessage")
      .then(()=>{
        this.log("emitSolicitedMessageAndWaitResponse emit success");
      })
      .catch((err)=>{
        this.log(`emitSolicitedMessageAndWaitResponse emit error ${err}`);
      });
    });
  }

  private emitInternal(event: string, body: any | undefined, type: messageType_t, solicitedMessgeIndex?: number){
    this.m_messageIndex++;
    const index = this.m_messageIndex;
    this.log(`emit (${index})`);

    return new Promise<void>((resolve, reject)=>{
      const message: message_t = {
        index:  index,
        type:   type,
        solicitedMessgeIndex: solicitedMessgeIndex,
        event:  event,
        body:   body
      };

      const timer_retry = setInterval(()=>{
        this.log(`emit (${index}) : retry`);
        this.m_socketio.emit("$message", message);
      }, 1000 * SyncSocketIO.s_config.retryIntervalSeconds);

      const timer_timeout = setTimeout(()=>{
        this.goodbyeInternal(`timeout ${SyncSocketIO.s_config.timeoutSeconds} sec.`);
        reject("timeout");
      }, 1000 * SyncSocketIO.s_config.timeoutSeconds);

      this.m_ackMessage
      .pipe(mergeMap((x)=>{
        if(x.index == index){
          return of(x);
        }
        return never();
      }))
      .pipe(take(1))
      .subscribe(()=>{
        clearInterval(timer_retry);
        clearTimeout(timer_timeout);
        this.log(`emit (${index}) : success`);
        resolve(void 0);
      },
      (err)=>{
        clearInterval(timer_retry);
        clearTimeout(timer_timeout);
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