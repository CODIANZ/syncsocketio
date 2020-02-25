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

なお、goodbye は、通信は発生せず、クライアントおよびサーバが保持するインスタンスの終了を宣言するものです。もし、通信を終了する場合に、確実に相手に通信終了の旨を知らせる場合には、非請求応答（または請求メッセージ）によって、実装側で処理を行います。詳しくは「 [クライアントからの終了](#クライアントからの終了) 」を参照してください。


### 4. 通信処理の物理的なエラーからの解放

通信処理にはネットワーク切断などの物理的なエラーが付き物ですが、この処理をロジックに組み込むとかなり厄介なコードになります。そこで、 syncsocketio はエラーが発生した場合、再送信処理を行い到達が確認できるまで繰り返します。

しかし、到達が確認できるまで無限に待ち続けると、かえって実装側の処理が複雑になる場合があるため、syncsocketioはメッセージの到達確認までのタイムアウトを設定することができます。これはsyncsocketioが発生する唯一のエラーです。詳しくは「 [syncsocketioの設定](#syncsocketioの設定) 」を参照してください。


## 使用方法（サーバ）

### インスタンスの生成は下記のように実装します。
```typescript
import Express = require("express");
import SocketIO = require("socket.io");
import Http = require("http");
import { SyncSocketIO } from "syncsocketio";

const express = Express();
const http = Http.createServer(express);
const socketio = SocketIO(http);

SyncSocketIO.waitForConnecting(socketIO, (syncsocketio)=>{
    /* 以降、syncsocketioでやり取りを行います。 */
    /* クライアントからの再接続処理についてはケアする必要はありません。 */
});
```

## 使用方法（クライアント）
### インスタンスの生成は下記のように実装します。
```typescript
import socketio from "socket.io-client";
import { SyncSocketIO } from "syncsocketio";

const uri = "接続先";
syncsocketio = SyncSocketIO.connect(socketio(uri)));
```

## 使用方法（サーバ・クライアント共通）

### syncsocketioの設定
```typescript
SyncSocketIO.Config = {
    bEnableLog: false,
    timeoutSeconds: 15,
    retryIntervalSeconds: 5
};
```
syncsocketioは送信したメッセージに対して、内部的にack応答を待ちます。そのack応答が一定時間ない場合には再試行を行いその再試行の間隔が retryIntervalSeconds（秒）となります。また、再試行を行ってもack応答が timeoutSeconds（秒）ない場合には、syncsocketioはtimeout状態になり、全てのPromiseはrejectで終了します。

なお、syncsocketioが発生する timeout は、送信したメッセージに対する内部的なack（相手がメッセージを受け取った通知）までの間に限定しています。従って、それ以外のtimeout処理は、実装側で行う必要があります。


### 非請求応答は下記のように実装します。
```typescript
/* 非請求応答の受信 */
syncsocketio.onUnsolicitedMessage("some receive event", (message: any)=>{
});

/* 非請求応答の送信 */
syncsocketio.emitUnsolicitedMessage("some message event", messagebody)
.then(()=>{
    /* 成功 */
})
.catch(()=>{
    /* 失敗 */
});
```

### 請求の送信および請求応答の受信は下記のように実装します。
```typescript
syncsocketio.emitSolicitedMessageAndWaitResponse("solicited message", messagebody)
.then((response)=>{
    const event = response.event;
    const body = response.body;
});
```

### 請求の応答および請求応答の送信は下記のように実装します。
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

### サーバからの終了
サーバからの終了は、goodbye() を呼び出します。goodbye()は、socket.ioをdisconnectします。その後、クライアントは切断に反応し再接続を試みますが、既にサーバがgoodbyeをしていることを知ると、onSolicitedMessage や onUnsolicitedMessage のPromiseは reject されます。

```typescript
syncsocketio.goodbye();
```

### クライアントからの終了
クライアントからの終了は、apiとして実装されていませんが、下記の実装により実現が可能です。

#### クライアントの実装（非請求応答を使用した例です）
```typescript
syncsocketio.emitUnsolicitedMessage("sayonara!")
.then(()=>{
    if(syncsocketio){
        syncsocketio.goodbye();
    }
})
.catch((err)=>{
    /* 既にサーバ側でgoodbyeが処理されている */
});
```

#### サーバの実装例（上記のクライアントの実装の場合）
```typescript
syncsocketio.onUnsolicitedMessage("sayonara!", ()=>{
    /* クライアントからのgoodbye要求受領 */
    syncsocketio.goodbye();
});
```

## 実装例（テンプレート）

実装例を兼ねたテンプレートは下記リポジトリにて公開していますので参考にしてください。

* サーバ側の実装 ... https://github.com/codianz/templ.webapp_socket_server

* クライアント側の実装 ... https://github.com/codianz/templ.webapp_client