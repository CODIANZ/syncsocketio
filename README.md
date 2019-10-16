# syncsocketio

## 概要

一般的に、ネットワーク通信において、請求・請求応答・非請求応答の３種類が存在します。

投げたメッセージに対し応答が必要ないメッセージを「非請求応答」と呼びます。（「応答」となるのが気持ち悪いかも知れませんが、自分が受信したメッセージが請求していないのに応答が届くという意味で「非請求応答」と呼ばれています。）

次に、メッセージに対して応答が必要なものを「請求（送信）」、それに対する応答を「請求応答」と呼びます。

一般的な同期通信では、請求・請求応答で一連の処理が順次行われ、一方的な通知やシグナル的な目的で非請求応答が行われます。

次に問題となるのは、socket.ioのサーバ側の実装です。socket.io のクライアント側の実装は非常にシンプルで、クライアントの Sokcet インスタンスは、途中切断されても同一のインスタンスを使用して通信を行うことができます。ところが、サーバの Socket インスタンスは、クライアントと接続した後、切断後、再接続になると、Socket インスタンが別のものになります。つまり、"connect" イベントにより得られた Socket インスタンスが新規接続なのか再接続なのかを見分ける術がありません。そして、その術を実装側で行うと、本来行わなければならない実処理と、通信処理が複雑に絡みメンテナンス性が低いコードになります。（と、思います。と、いうか、なったので、sokcet.ioと実装の中間の層を作りました。）

上記を踏まえ、 syncsocketio は socket.io に下記の拡張を行います。

### 1. 到達保証

syncsocketioより送信するメッセージは Promise を返却し、到達を確認した後にresolveします。

### 2. 請求および請求応答（非請求応答）

特定の請求に対しての請求応答を得る処理を簡略化することができます。具体的には、請求を行うとPromiseが返却されresolveする値は請求応答です。また、請求は複数非同期に実行しても、請求と請求応答が一対一であることを保証します。

### 3. インスタンスの継続性の保証

クライアントおよびサーバで使用する Socket インスタンスは、明示的な切断を行わない限り自動的に再接続が行われ（再接続は socket.io のクライアント側の機能です）、再説後に同一のセッションによる接続かどうかは syncsocketio がハンドリングし、バインドを行います。つまり、 syncsocketio を使用している限り、切断されたかどうかを意識することなく通信処理を記述することができます。

一連の順次処理が終了、または、実装側で異常と判断した場合に明示的な切断である goodbye を呼び出し、処理を終了させます。例えば、実装側で定義した終了イベントや、送信を行ったが数秒経っても送信が完了していない場合のタイムアウトは実装側で判断し、goodbye を呼び出し切断を行います。

なお、goodbye は、通信は発生せず、クライアントおよびサーバが保持するインスタンスの終了を宣言するものです。（通信処理の終了処理はかなり厄介な問題で、現バージョンでは同期終了はサポートしていません。）

### 4. 通信中のエラー処理をゼロにする

通信処理にはエラーが付き物ですが、この処理をロジックに組み込むとかなり厄介なコードになります。そこで、 syncsocketio はエラーが発生した場合、再送信処理を行い到達が確認できるまで繰り返します。

逆に、通信状態の如何によらず、再送信を続けるため、タイムアウト処理は実装側で行い、適宜 goodbye により通信を終了していただく必要があります。


## 使用方法（サーバ）

### インスタンスの生成と非請求応答は下記のように実装します。
```typescript
import Express = require("express");
import SocketIO = require("socket.io");
import Http = require("http");
import { SyncSocketIO } from "syncsocketio";

const express = Express();
const http = Http.createServer(express);
const socketio = SocketIO(http);

SyncSocketIO.waitForConnecting(socketIO, (syncsocketio)=>{
    /* 非請求応答の受信 */
    syncsocketio.onUnsolicitedMessage("some receive event", (message: any)=>{
    });

    /* 非請求応答の送信 */
    syncsocketio.emit("some message event", messagebody)
    .then(()=>{
        /* 成功 */
    })
    .catch(()=>{
        /* 失敗 */
    });
});
```

## 使用方法（クライアント）
```typescript
import socketio from "socket.io-client";
import { SyncSocketIO } from "syncsocketio";

const uri = "接続先";
syncsocketio = SyncSocketIO.connect(socketio(uri)));
```

## 使用方法（サーバ・クライアント共通）

### 請求の送信および請求応答の受信は下記のように実装します。
```typescript
syncsocketio.emitSolicitedMessageAndWaitResponse("solicited message", messagebody)
.then((response)=>{
    const event = response.event;
    const body = response.body;
});
```

### 請求のの応答および請求応答の送信は下記のように実装します。
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

### 終了処理は下記のように実装します。
```typescript
/* socket.io の disconnect() および、Promise の reject 処理を行います。 */
/* socket.io の disconnect() が通信の相手方に及ぼす影響は感知していない点に注意が必要です。 */
syncsocketio.goodbye();
```

