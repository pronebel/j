
const { getMemberList } = require('./fun.js')
const createErr = require('./createErr.js')

let doingSomething = false

// 待办事项列表 先进先出 push shift
let todoList = []

/*
msgItem = {
  key,
  Type,
  Content,
  toList: [{
    premd5,
    ToUserName,
    failCount
  }]
}
*/
let msgList = []

const getLeftMsgCount = () => {
  // todoList
  const c1 = todoList.filter(item => {
    return item.method === 'text' || item.method === 'img'
  }).length

  const c2 = msgList.reduce((accumulator, currentValue) =>
    accumulator + currentValue.toList.length 
  , 0)

  return c1 + c2
}

const pushToTodoList = (arg, Content, file, buf) => {
  if (arg.Msg.Type === 1) {
    arg.Msg.Content = Content
    todoList.push({ method: 'text', arg })
  } else {
    arg.file = file
    arg.buf = buf
    todoList.push({ method: 'img', arg })
  }
}

const addMsgToTodoList = FromUserName => {
  if (msgList.length > 0) {
    // msgItem = { key, Type, (Content || file, buf), toList }
    // toList: [{ premd5, ToUserName, failCount }]
    const { key, Type, Content, file, buf, toList } = msgList[0]
    const { premd5, ToUserName, failCount } = toList.shift()
    if (toList.length === 0) {
      msgList.shift()
    }

    // arg: { Msg, key, premd5, failCount, err }
    // Msg: { Content, FromUserName, ToUserName, Type: 1 }
    const Msg = { FromUserName, ToUserName, Type }
    const arg = { Msg, key, premd5, failCount }

    pushToTodoList(arg, Content, file, buf)
    // if (Type === 1) {
    //   arg.Msg.Content = Content
    //   todoList.push({ method: 'text', arg })
    // } else {
    //   // arg.Msg.Content = ''
    //   arg.file = file
    //   arg.buf = buf
    //   todoList.push({ method: 'img', arg })
    // }
  }
}

const methods = {
  async getcontact (seq) {
    const { Seq, MemberList } = await this.webwxapi.webwxgetcontact(
      // this.ctx.loginCode.query.lang,
      this.ctx.passTicket,
      seq,
      this.ctx.BaseRequest.Skey
    )
  
    const list = getMemberList(MemberList)
    this.notify('getMemberlist', list)
  
    if (Seq === 0) {
      // this.jrobot.emit('on_message', { key: 'getMemberlistEnded' })
      this.notify('getMemberlistEnded')
    } else {
      todoList.push({ method: 'getcontact', arg: Seq })
    }
  },

  async batchgetcontact (List) {
    const list = await this.webwxapi.webwxbatchgetcontact(
      // this.ctx.loginCode.query.lang,
      this.ctx.passTicket,
      this.ctx.BaseRequest,
      List
    )
  
    // this.jrobot.emit('on_message', {
    //   key: 'batchlist',
    //   value: list
    // })
    this.notify('batchlist', list)
  },

  /**
   * 
   * @param { Msg, key, premd5, failCount, err } msg
   * Msg: { Content, ToUserName, Type: 1 }
   * 
   */
  async text (msg) {
    try {
      // const msgId = (+new Date() + Math.random().toFixed(3)).replace('.', '')
      // msg.Msg.ClientMsgId = msgId
      // msg.Msg.LocalID = msgId

      // this.notify('startSendmsg', {
      //   premd5: msg.premd5,
      //   Type: msg.Msg.Type
      // })
      beforeSendmsg.bind(this)(msg)

      const res = await this.webwxapi.webwxsendmsg(
        this.ctx.passTicket,
        this.ctx.BaseRequest,
        msg.Msg
      )

      if (!(res && res.BaseResponse && res.BaseResponse.Ret === 0)) {
        throw createErr(700, '发送文本消息失败')
      }
    } catch (err) {
      // console.log(err)
      // msg.failCount++
      // const status = err.status || err.statusCode || err.code || 999
      // const message = err.message || '未处理错误'
      // msg.err = { status, message }
      whenSendMsgCatchErr(msg, err)
    } finally {
      // msg.leftMsgCount = getLeftMsgCount()
      // this.notify('sendmsgBack', msg)
      sendMsgFinally.bind(this)(msg)
    }
  },

  /**
   * 
   * @param { Msg, file, buf, key, premd5, failCount, err } msg
   * Msg: { ToUserName, Type: 3 }
   */
  async img (msg) {
    try {
      // const msgId = (Date.now() + Math.random().toFixed(3)).replace('.', '')
      // msg.Msg.ClientMsgId = msgId
      // msg.Msg.LocalID = msgId

      // this.notify('startSendmsg', {
      //   premd5: msg.premd5,
      //   Type: msg.Msg.Type
      // })
      beforeSendmsg.bind(this)(msg)

      let res = await this.webwxapi.webwxuploadmedia({
        BaseRequest: this.ctx.BaseRequest,
        webwxDataTicket: this.ctx.webwxDataTicket,
        file: msg.file,
        buf: msg.buf,
        Msg: msg.Msg
      })

      if (!(res && res.MediaId &&
          res.BaseResponse && res.BaseResponse.Ret === 0)) {
        throw createErr(701, '上传图片失败')
      }
      msg.Msg.MediaId = res.MediaId

      res = await this.webwxapi.webwxsendmsgimg(
        this.ctx.passTicket,
        this.ctx.BaseRequest,
        msg.Msg
      )

      if (!(res && res.BaseResponse && res.BaseResponse.Ret === 0)) {
        throw createErr(702, '发送图片消息失败')
      }
    } catch (err) {
      // console.log(err)
      // msg.failCount++
      // const status = err.status || err.statusCode || err.code || 999
      // const message = err.message || '未处理错误'
      // msg.err = { status, message }
      whenSendMsgCatchErr(msg, err)
    } finally {
      // msg.leftMsgCount = getLeftMsgCount()
      // this.notify('sendmsgBack', msg)
      sendMsgFinally.bind(this)(msg)
    }
  }
}

function beforeSendmsg (msg) {
  const msgId = (Date.now() + Math.random().toFixed(3)).replace('.', '')
  msg.Msg.ClientMsgId = msgId
  msg.Msg.LocalID = msgId

  this.notify('startSendmsg', {
    premd5: msg.premd5,
    Type: msg.Msg.Type
  })
}
function whenSendMsgCatchErr (msg, err) {
  msg.failCount++
  const status = err.status || err.statusCode || err.code || 999
  const message = err.message || '未处理错误'
  msg.err = { status, message }
}
function sendMsgFinally (msg) {
  msg.leftMsgCount = getLeftMsgCount()
  this.notify('sendmsgBack', msg)
}

async function doSome (method, arg) {
  /* istanbul ignore else */
  if (methods[method]) {
    doingSomething = true

    const methodBind = methods[method].bind(this)
    await methodBind(arg)
    
    doingSomething = false
  }
}

module.exports = {
  // async getcontact (arg) {
  //   await methods.getcontact(arg, this)
  // },

  async do () {
    try {
      addMsgToTodoList(this.ctx.User.UserName)
      
      /* istanbul ignore else */
      if (!doingSomething && todoList.length > 0) {
        const { method, arg } = todoList.shift()
        // /* istanbul ignore else */
        // if (methods[method]) {
        //   doingSomething = true

        //   const methodBind = methods[method].bind(this)
        //   await methodBind(arg)
          
        //   doingSomething = false
        // }
        await doSome.bind(this)(method, arg)
      }
    } catch (err) {
      // console.log(err)
      this.ctx.status = err.status || err.statusCode || err.code || 999
      this.ctx.message = err.message || '未处理错误'
      // this.jrobot.emit('on_message', { key: 'onerror', value: this.ctx })
      this.notify('onerror', this.ctx)
  
      doingSomething = false
    }
  },

  add (method, arg) {
    todoList.push({ method, arg })
  },

  /*
  msgItem: {
    key,
    Type,
    Content, || file, buf
    toList: [{
      premd5,
      ToUserName,
      failCount
    }]
  }
  */
  storeToMsgList(msgItem) {
    msgList.push(msgItem)
  }
}
