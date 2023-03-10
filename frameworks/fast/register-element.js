const {
  registerElement,
  registerProperties,
  evalInContext,
  delayDispatcher,
} = (() => {
  const evalInContext = (exp, context, throws) => {
    return throws ?
      function () {
        with (this) {
          return eval(`(${exp})`);
        }
      }.call(context)
      :
      function () {
        with (this) {
          try {
            return eval(`(${exp})`);
          } catch (e) {
            console.log(exp);
            console.log(e);
            return;
          }
        }
      }.call(context);
  };

  const removeItem = (item) => {
    const clearItem = (/**@type {HTMLElement}*/ item) => {
      for (let c of item.childNodes) {
        clearItem(c);
      }
      let onRemoves = item.onRemoves;
      item.onRemoves = undefined;
      if (onRemoves?.length) {
        onRemoves.forEach((onRemove) => onRemove());
      }
    };
    clearItem(item);
    item.remove();
  };

  const onprop = (parent, /**@type {String} */ exp, context, listener) => {
    const tokens = exp.split(/\.|\?\.|\[|\]/);
    if (!tokens[1]) {
      if (context.tmpCtxName === tokens[0]) {
      } else {
        context.on && context.on(tokens[0], listener, true, parent);
        parent.onRemoves = [
          ...(parent.onRemoves || []),
          () => {
            context.off(tokens[0], listener, true);
          },
        ];
      }
      return;
    }
    if (context.tmpCtxName === tokens[0]) {
      context = context[context.tmpCtxName];
      tokens.shift();
    }
    const clearBind = (current) => {
      while (current) {
        if (current.off) {
          current.off();
        }
        const next = current.next;
        current.next = undefined;
        current = next;
      }
    };
    const register = (tokens, handler, context, offChain) => {
      const prop = tokens[0];
      if (!prop || !context) {
        return;
      }
      offChain.next = {};
      const registerNext = () => {
        register(tokens.slice(1), handler, context[prop], offChain.next);
      };
      if (context.on && context.on instanceof Function) {
        const listener = (...args) => {
          clearBind(offChain.next);
          offChain.next = {};
          registerNext();
          handler(...args);
        };
        context.on(prop, listener, true, parent);
        offChain.off = () => {
          context.off(prop, listener, true);
        };
      }
      registerNext();
    };
    const offChain = {};
    register(tokens, listener, context, offChain);
    parent.onRemoves = [
      ...(parent.onRemoves || []),
      () => {
        clearBind(offChain);
      },
    ];
  };

  const bindingForInstruction = (/**@type HTMLElement */ element) => {
    let forExp = element.getAttribute("for.");
    const match = forExp.match(
      /^\s*(((let|const|of)\s+)?(\w+)\s+(of|in)\s+)?\s*(.+)\s*$/
    );
    if (!match || !match[6]) {
      throw new Error("Invalid for Expression");
    }
    const collectionName = match[6];
    const of_in = match[5] || "of";
    let varName = match[4];
    let forHead;
    if (varName) {
      forHead = `for(const ${varName} ${of_in} ${collectionName})`;
    } else {
      varName = "$$i";
      forHead = `for(const ${varName} of ${collectionName})`;
    }
    const comment = document.createComment(element.outerHTML);
    const parent = element.parentElement;
    parent.insertBefore(comment, element);
    element.remove();
    /**@type Map<any, HTMLElement> */
    let items = new Map();
    /**@type Map<any, HTMLElement> */
    let newItems = new Map();
    let idx = 0;
    let allRemoved = false;
    const update = () => {
      (function ($$forEach) {
        newItems = new Map();
        idx = 0;
        allRemoved = false;
        with (this) {
          eval(`
        let collection
        try{
          collection = this.${collectionName}
        }
        catch{
          //ignore
        }
        if (collection) {
          ${forHead}{
            $$forEach(${varName})
            }
        }`);
        }
        for (const [_, { item }] of items) {
          removeItem(item);
        }
        items = newItems;
      }.call(element.context, ($$i) => {
        /**@type HTMLElement */
        let item;
        if (items.has($$i)) {
          const pair = items.get($$i);
          item = pair.item;
          if (!allRemoved && idx !== pair.idx) {
            console.log("removed");
            for (const [_, { item }] of items) {
              removeItem(item);
            }
            allRemoved = true;
          }
          items.delete($$i);
        } else {
          item = element.cloneNode(true);
          item.removeAttribute("id");
          item.removeAttribute("for.");
          if (item.updateModel) {
            item.model = $$i;
          } else {
            item.modelBeforeInit = $$i;
          }
          const context = Object.create(element.context);
          context[varName] = $$i;
          context.tmpCtxName = varName;
          item.context = context;
        }
        parent.insertBefore(item, comment);
        newItems.set($$i, { idx, item });
        binding(item);
        idx++;
      }));
    };
    update();
    let lastContext = element.context;
    comment.updateWhenModelChange = () => {
      if (lastContext === element.context) {
        return;
      }
      lastContext = element.context;
      update();
    };
    onprop(parent, collectionName, element.context, update);
    return {};
  };

  const bindingIfInstruction = (
      /**@type HTMLElement */ element,
    keyChangeRemove
  ) => {
    let ifExp = element.getAttribute("if.");
    const comment = document.createComment(element.outerHTML);
    const parent = element.parentElement;
    parent.insertBefore(comment, element);
    element.remove();
    let item;
    let lastValue;
    const update = () => {
      const value = evalInContext(ifExp, element.context);
      if (keyChangeRemove && value !== lastValue && item) {
        removeItem(item);
        item = undefined;
      }
      if (value) {
        if (item) {
          return;
        }
        item = element.cloneNode(true);
        item.removeAttribute("if.");
        item.removeAttribute("keyif.");
        parent.insertBefore(item, comment);
        item.context = element.context;
        binding(item);
      } else if (item) {
        removeItem(item);
        item = null;
      }
    };
    update();
    let lastContext = element.context;
    comment.updateWhenModelChange = () => {
      if (lastContext === element.context) {
        return;
      }
      lastContext = element.context;
      update();
    };
    for (const exp of getPropsFromExp(ifExp)) {
      onprop(parent, exp, element.context, update);
    }
    return {};
  };

  const getPropNameFromBindingAttr = (attr) => {
    return attr.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  };

  const getPropsFromExp = (exp) => {
    return exp.match(/([a-zA-Z0-9_$.\[\]]|\?\.)+/g) || [];
    // return exp.match(/[a-zA-Z0-9_$.]+/g) || []
  };

  const bindingAttrs = (/**@type HTMLElement */ element) => {
    if (element.hasAttribute("for.")) {
      return bindingForInstruction(element);
    }
    if (element.hasAttribute("if.")) {
      return bindingIfInstruction(element, element.hasAttribute("keyif."));
    }
    if (element.updateWhenModelChange) {
      element.updateWhenModelChange();
      return element;
    }
    const bindingAttrs = element
      .getAttributeNames()
      .filter((p) => p.endsWith("."));
    for (const prop of bindingAttrs) {
      const $$exp = element.getAttribute(prop);
      const effectedAttr = prop
        .slice(0, -".".length)
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a);

      if (effectedAttr.some((a) => a.startsWith("on"))) {
        const value = `(function($event){with(this){${$$exp}}}).call(event.target.context, event)`;
        for (const ea of effectedAttr) {
          if (ea.endsWith("$")) {
            element.setAttribute(
              ea.slice(0, -1),
              "event.stopPropagation();" + value
            );
          } else {
            element.setAttribute(ea, value);
          }
        }
        continue;
      }
      const update = () => {
        const value = evalInContext($$exp, element.context);
        for (const ea of effectedAttr) {
          if (ea === "model") {
            if (element.updateModel) {
              element.updateModel(value);
            } else {
              element.modelBeforeInit = value;
            }
            continue;
          }
          if (ea === "focus") {
            if (value) {
              if (element.scrollIntoViewIfNeeded) {
                element.scrollIntoViewIfNeeded();
              } else {
                element.scrollIntoView();
              }
              element.focus();
            }
            continue;
          }
          if (ea === "scrollintoview") {
            if (value) {
              if (element.scrollIntoViewIfNeeded) {
                element.scrollIntoViewIfNeeded();
              } else {
                element.scrollIntoView();
              }
            }
            continue;
          }
          if (ea.startsWith("class-")) {
            const className = ea.slice("class-".length);
            if (value) {
              element.classList.add(className);
            } else {
              element.classList.remove(className);
            }
            continue;
          } else if (ea.startsWith("style-")) {
            const prop = ea.slice("style-".length, -1);
            element.style.setProperty(prop, value);
            continue;
          }
          if (ea.endsWith("$")) {
            let prop = getPropNameFromBindingAttr(ea.slice(0, -1));
            switch (prop) {
              case "innerHtml":
                prop = "innerHTML";
                break;
            }
            element[prop] = value;
            continue;
          }
          if (value === undefined || value === null) {
            element.removeAttribute(ea);
          } else if (element[ea] !== value) {
            element.setAttribute(ea, value);
          }
        }
      };
      update();
      for (const exp of getPropsFromExp($$exp)) {
        onprop(element.parentElement, exp, element.context, update);
      }
    }
    return element;
  };

  const binding = (/**@type HTMLElement */ element) => {
    /**@type { Object.<string,HTMLElement> } */
    const components = element.context.components;
    if (element.hasAttribute) {
      const handler = bindingAttrs(element);
      //collect ids
      if (element.hasAttribute("id")) {
        components[element.getAttribute("id")] = handler;
      }
      if (handler !== element) {
        return;
      }
    }
    for (const child of [...element.children]) {
      if (
        child.context == element.context ||
        (child.context &&
          Object.getPrototypeOf(child.context) === element.context)
      ) {
      } else {
        child.context = element.context;
      }
      binding(child);
    }
  };

  const getNameFromTagName = (tagName) => {
    return tagName.replace(/(?:^|-)(\w)/g, (_, c) => c.toUpperCase());
  };

  class DelayDispatcher {
    constructor(delay = 50) {
      this.delay = delay;
      this.currentTask;
      this.running = false;
      this.lastDispatchTime = 0;
      this.groups = new Map();
      this.count = 0;
      // this.delayListeners = new Map()
    }

    set(obj, key, method) {
      let group = this.groups.get(obj);
      if (!group) {
        group = {};
        this.groups.set(obj, group);
      }
      group[key] = method;
      this.resolveWaitingTask?.()
    }

    async start() {
      if (this.running) {
        return;
      }
      this.running = true;
      this.currentTask = new Promise(async (resolve) => {
        while (this.running) {
          let now = Date.now();
          let remain = this.delay - (now - this.lastDispatchTime);
          if (remain > 0) {
            await new Promise((r) => setTimeout(r, remain));
          }
          let groups = this.groups;
          let hasTask = false
          await new Promise((resolve) =>
            window.requestAnimationFrame(async () => {
              this.groups = new Map();
              for (let [obj, group] of groups) {
                if (!obj || !group) {
                  continue;
                }
                for (let p in group) {
                  try {
                    hasTask = true
                    group[p]?.();
                  } catch (e) {
                    console.log(e);
                  }
                }
              }
              resolve();
            })
          );
          this.lastDispatchTime = Date.now();
          if (!hasTask) {
            await new Promise(resolve => {
              this.resolveWaitingTask = resolve
            })
            this.resolveWaitingTask = undefined
          }
        }
        this.currentTask = undefined;
        this.running = false;
        resolve();
      });
      await this.currentTask;
    }

    async stop() {
      this.running = false;
      await this.currentTask;
    }

    setDelay(delay) {
      this.delay = delay;
    }
  }

  const delayDispatcher = new DelayDispatcher();

  const registerProperties = (obj, ...props) => {
    const backup = {};
    if (!obj.define) {
      addPropChange(obj);
    }
    props.forEach((prop) => {
      const desc = Object.getOwnPropertyDescriptor(obj, prop);
      if (desc && !desc.configurable) {
        delete backup[prop];
        return;
      }
      let propValue;
      let [propName, handler] =
        prop instanceof Array ? prop : [prop, undefined];
      if (obj[propName] !== undefined) {
        backup[propName] = obj[propName];
      }
      Object.defineProperty(obj, propName, {
        get() {
          return propValue;
        },
        set(newValue) {
          if (propValue === newValue) {
            return;
          }
          const oldValue = propValue;
          propValue = newValue;
          obj.raise(propName, newValue, oldValue);
          handler?.(newValue, oldValue);
          delayDispatcher.set(obj, propName, () => {
            obj.raise(propName, newValue, oldValue, true);
          });
        },
      });
    });
    Object.assign(obj, backup);
    return obj;
  };

  const registerAllProperties = (obj) => {
    return registerProperties(obj, ...Object.keys(obj));
  };

  Object.defineProperty(Object.prototype, "registerProperties", {
    value: function (...props) {
      return registerProperties(this, ...props);
    },
  });

  Object.defineProperty(Object.prototype, "registerAllProperties", {
    value: function () {
      return registerAllProperties(this);
    },
  });

  delayDispatcher;

  const addPropChange = (/**@type { Object } */ obj) => {
    /**@type Map<string, Set<{(newValue, oldValue):any}>> */
    const atonceListeners = new Map();
    const delayListeners = new Map();
    const thisProp = "this";
    Object.defineProperty(obj, thisProp, {
      get() {
        return obj;
      },
    });
    Object.defineProperty(obj, "define", {
      value: (...props) => registerProperties(obj, ...props),
    });
    Object.defineProperty(obj, "on", {
      value: (
          /**@type string */ prop,
        listener,
        delay = false,
        additional
      ) => {
        let l = delay ? delayListeners : atonceListeners;
        if (!l.has(prop)) {
          l.set(prop, new Map());
        }
        l.get(prop).set(listener, additional);
        if (delay && delayDispatcher?.delayListeners) {
          delayDispatcher.delayListeners.set(listener, additional);
        }
        delayDispatcher.count++;
      },
    });

    Object.defineProperty(obj, "off", {
      value: (prop, listener, delay = false) => {
        let l = delay ? delayListeners : atonceListeners;
        if (!l.has(prop)) {
          return;
        }
        l.get(prop).delete(listener);
        if (delay && delayDispatcher?.delayListeners) {
          delayDispatcher.delayListeners.delete(listener);
        }
        delayDispatcher.count--;
      },
    });

    Object.defineProperty(obj, "clearOn", {
      value: (delay) => {
        let l = delay ? delayListeners : atonceListeners;
        delayDispatcher.count -= l.size;
        if (delay && delayDispatcher?.delayListeners) {
          l.forEach((_, listener) => {
            delayDispatcher.delayListeners.delete(listener);
          });
        }
        l.clear();
        // for (let p in obj) {
        //   obj[p].clearOn?.(delay)
        // }
      },
    });
    Object.defineProperty(obj, "dispose", {
      value: () => {
        obj.clearOn(false);
        obj.clearOn(true);
      },
    });
    Object.defineProperty(obj, "hasOn", {
      value: (prop, delay = false) => {
        let l = delay ? delayListeners : atonceListeners;
        return l.has(prop);
      },
    });

    Object.defineProperty(obj, "raise", {
      value: (prop, newValue, oldValue, delay = false) => {
        if (prop !== thisProp) {
          obj.raise(thisProp, obj, obj, delay);
        }
        let l = delay ? delayListeners : atonceListeners;
        if (!l.has(prop)) {
          return;
        }
        for (const [listener, _] of l.get(prop)) {
          listener(newValue, oldValue);
        }
      },
    });
  };

  const registerElement = (tagName, /**@type { string } */ constructor) => {
    const elementClassName = `HTML${constructor || getNameFromTagName(tagName)
      }Element`;
    constructor = constructor || "Object";
    eval(`
  class ${elementClassName} extends HTMLElement{
    constructor(){
      super()
      const shadow = this.attachShadow({mode:'open'})
      const template = document.getElementById('${tagName}')
      if(!template || template.tagName !== 'TEMPLATE' ){
        throw new Error('Define Template')
      }
      this.template_ = template
      this.shadow_ = shadow
      this.model_ = new ${constructor}()
      this.model_.components = { host: this.shadow_ }
      if(this.context && this.hasAttribute('model.')){
        const modeExp = this.getAttribute('model.')
        this.model = evalInContext(modeExp, this.context)
      }else if(this.modelBeforeInit){
        this.model = this.modelBeforeInit
      }else{
        this.model =  {}
      }
    }

    rebuildView(){
      this.shadow_.innerHTML = ''
      const instance = document.importNode(this.template_.content, true)
      this.shadow_.appendChild(instance)
    }

    get model(){
      return this.model_
    }

    set model(value){
      if(value?.on){
        this.model_ = value || {}
        this.model_.components = { host: this.shadow_ , ...this.model_.components||{}}
      }else{
        //combine code behind with model
        Object.assign(this.model_, value)
      }
      this.shadow_.context = this.model_ 
      this.rebuildView()
    }

    updateModel(value){
      this.model = value
      this.connectedCallback()
    }
    
    connectedCallback(){
      binding(this.shadow_)
      if(this.model_.launch){
        this.model_.launch()
      } 
    }
  }
  customElements.define('${tagName}', ${elementClassName})
  `);
  };
  return {
    registerElement,
    registerProperties,
    evalInContext,
    delayDispatcher,
  };
})();