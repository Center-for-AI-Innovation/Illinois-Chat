from flask_executor import Executor
from injector import inject

try:
  from ai_ta_backend.rabbitmq.log_setup import current_context, run_with_context
except ModuleNotFoundError:
  from log_setup import current_context, run_with_context


class ExecutorInterface:

  def submit(self, fn, *args, **kwargs):
    raise NotImplementedError


class FlaskExecutorAdapter(ExecutorInterface):
  """
	Adapter for Flask Executor, suitable for I/O-bound tasks that benefit from asynchronous execution.
	Use this executor for tasks that involve waiting for I/O operations (e.g., network requests, file I/O),
	where the overhead of creating new threads or processes is justified by the time spent waiting.
	"""

  @inject
  def __init__(self, executor: Executor):
    self.executor = executor

  def submit(self, fn, *args, **kwargs):
    # Pool threads do not inherit the request's log context, so pass it along.
    return self.executor.submit(run_with_context, current_context(), getattr(fn, '__name__', repr(fn)), fn, *args,
                                **kwargs)
