# syncsocketio

## 概要

一般的に、ネットワーク通信において、請求・請求応答・非請求応答の３種類が存在します。

投げたメッセージに対し応答が必要ないメッセージを「非請求応答」と呼びます。（「応答」となるのが気持ち悪いかも知れませんが、自分が受信したメッセージが請求していないのに応答が届くという意味で「非請求応答」と呼ばれています。）

次に、メッセージに対して応答が必要なものを「請求（送信）」、それに対する応答を「請求応答」と呼びます。

一般的な同期通信では、請求・請求応答で一連の処理が順次行われ、シグナル的な目的で非請求応答が行われます。

上記を踏まえ、 syncsocketio は socket.io に下記の拡張を行います。

### 1. 到達保証

emit() は Promise を返却し、到達を確認した後にresolveします。

### 2. 請求および請求応答（非請求応答）

特定の請求に対しての請求応答を得る処理を簡略化することができます。<br>
具体的には、請求を行うとPromiseが返却されresolveする値は請求応答です。<br>
また、請求は複数非同期に実行しても、請求と請求応答が一対一であることを保証します。

### 3. 互換性

socket.io の emit() および on() については完全な互換性があります。<br>
この場合の emit() は非請求応答として扱われます。<br>
その他の soket.io の機能は RawSocket() を使用してアクセスすることができます。

## 使用方法

### 1. インスタンスの生成と非請求応答は下記のように実装します。（ほぼsocket.ioと変わりません）
```typescript
import Express = require("express");
import SocketIO = require("socket.io");
import Http = require("http");
import { SyncSocketIO } from "syncsocketio";

const express = Express();
const http = Http.createServer(express);
const socketio = SocketIO(http);

socketio.on("connect", (socket: SocketIO.Socket)=>{
    const syncsocketio = new SyncSocketIO(socket);

    /* socket.io の on() と同様 */
    syncsocketio.on("some receive event", (message: any)=>{
    });

    /* socket.io の emit() と同様（ただし、メッセージが届くまで再送を行います） */
    syncsocketio.emit("some message event", messagebody);

    /* emit() 後に相手方の到達が確認できると resolve する Promise が返却されます */
    syncsocketio.emit("some message event", messagebody)
    .then(()=>{
        /* 成功 */
    })
    .catch(()=>{
        /* 失敗 */
    });
});
```

### 2. 請求の送信および請求応答の受信は下記のように実装します。
```typescript
syncsocketio.emitSolicitedMessageAndWaitResponse("solicited message", messagebody)
.then((response)=>{
    const event = response.event;
    const body = response.body;
});
```

### 3. 請求のの応答および請求応答の送信は下記のように実装します。
```typescript
syncsocketio.onSolcitedMessage("solicited message", (index: number, messagebody: any) => {
    /* index はどの請求かを特定するために使用するのでそのまま emitSolicitedResponse() に渡してください */

    /* 請求に対する応答を送信します */
    syncsocketio.emitSolicitedResponse(index, "event type", responsebody)
    .then(()=>{
        /* 成功 */
    })
    .catch(()=>{
        /* 失敗 */
    });
});
```

### 4. 返却されるPromiseでrejectになるのは、明示的に disconnect が処理された場合のみであり、通常のネットワークの瞬停はrejectされません。
