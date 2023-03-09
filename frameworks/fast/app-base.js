import { sleep } from 'sleep.js'

export class AppBase {
  async launch () {
    this.storage = this.initStorage_()
    this.data = await this.initData(window.appData)
    window.app = this
    await this.start()
  }

  async registerStorageProperties (...props) {
    if (!this.storage) {
      return
    }
    let asyncTimeout = 50
    const bgTimeout = 200
    for (const [prop, defaultValue, onchange] of props) {
      let propValue
      let valueModified = false
      let successLoadFromStorage = false
      let loadFunc
      let bgLoad = false
      const mergeValue = (savedValue) => {
        if (successLoadFromStorage) {
          return
        }
        successLoadFromStorage = true
        if (!valueModified) {
          valueModified = true
          propValue = savedValue
        } else {
          // merge strategy
          propValue = savedValue
        }
        if (bgLoad && onchange) {
          onchange()
        }
      }
      loadFunc = async () => {
        const jsonStr = await this.storage.getItem(prop)
        let savedValue
        if (!jsonStr) {
          savedValue = defaultValue
        } else {
          try {
            savedValue = JSON.parse(jsonStr)
          } catch {
            savedValue = defaultValue
          }
        }
        mergeValue(savedValue)
      }
      const tryLoad = async () => {
        bgLoad = true
        const func = loadFunc
        loadFunc = null
        await Promise.race([
          func(),
          sleep(bgTimeout).then(() => {
            if (!successLoadFromStorage) {
              loadFunc = func
            }
          })
        ])
      }
      await Promise.race([
        loadFunc(),
        sleep(asyncTimeout).then(() => {
          if (!valueModified) {
            propValue = defaultValue
            valueModified = true
            asyncTimeout = 0
          }
        })
      ])
      Object.defineProperty(this, prop, {
        get () {
          if (loadFunc) {
            tryLoad()
          }
          return propValue
        },
        set (newValue) {
          propValue = newValue
          if (successLoadFromStorage) {
            this.storage.setItem(prop, JSON.stringify(propValue))
          }
        }
      })
    }
  }

  initStorage_ () {
    if (window.$localStorage) {
      return window.$localStorage
    }
    try {
      const s = window.localStorage
      return s
    } catch {
      return {
        getItem: () => '',
        setItem: () => true
      }
    }
  }

  async initData (data) {
    return data
  }

  async start () {
    console.log('start')
  }

  async pause () {
    console.log('pause')
  }

  async resume () {
    console.log('pause')
  }

  async stop () {
    console.log('stop')
  }
}
