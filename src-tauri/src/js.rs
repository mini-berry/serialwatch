use rquickjs::Context;

pub struct JsHandler {
    _runtime: rquickjs::Runtime,
    context: rquickjs::Context,
    send_script: String,
    recv_script: String,
}

impl JsHandler {
    pub fn new() -> Self {
        let runtime = rquickjs::Runtime::new().unwrap();
        runtime.set_memory_limit(5 * 1024 * 1024);
        runtime.set_max_stack_size(1024 * 1024);
        let context = Context::full(&runtime).unwrap();
        Self {
            context,
            _runtime: runtime,
            send_script: String::new(),
            recv_script: String::new(),
        }
    }

    pub fn set_send_script(&mut self, script: String) {
        self.send_script = script;
    }

    pub fn set_recv_script(&mut self, script: String) {
        self.recv_script = script;
    }

    pub fn validate_script(&self, script: String) -> Result<(), String> {
        self.context.with(
            |ctx| match rquickjs::Module::declare(ctx.clone(), "check.js", script) {
                Ok(_) => Ok(()),
                Err(e) => Err(format!("Script validation error: {}", e)),
            },
        )
    }
}
