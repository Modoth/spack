class App {
  constructor () {
    /** @type { Object.<string,HTMLElement> } */
    this.components
    registerProperties(this, 'title')
  }

  initData () { }
  start () {
    /** @type { { toast:(msg:string, timeout:number = 1000)=>Promise<any> } } */
    this.modal_ = this.components.modal.model
    this.title = 'hello'
  }
}
