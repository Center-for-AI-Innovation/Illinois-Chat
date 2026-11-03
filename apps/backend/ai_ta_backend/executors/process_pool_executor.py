import logging
from concurrent.futures import ProcessPoolExecutor

try:
  from ai_ta_backend.rabbitmq.log_setup import bind, clear, current_context, run_with_context
except ModuleNotFoundError:
  from log_setup import bind, clear, current_context, run_with_context

logger = logging.getLogger(__name__)


class ProcessPoolExecutorInterface:

  def submit(self, fn, *args, **kwargs):
    raise NotImplementedError


class ProcessPoolExecutorAdapter(ProcessPoolExecutorInterface):
  """
	Adapter for Python's ProcessPoolExecutor, suitable for CPU-bound tasks that benefit from parallel execution.
	Use this executor for tasks that require significant computation and can be efficiently parallelized across multiple CPUs.
	Not for I/O-bound tasks like database queries, file I/O, or network requests, as the overhead of creating and managing processes can outweigh the benefits.
	
	This executor is ideal for scenarios where the task execution time would significantly benefit from being distributed
	across multiple processes, thereby bypassing the GIL (Global Interpreter Lock) and utilizing multiple CPU cores.
	
	Note: ProcessPoolExecutor is best used with tasks that are relatively heavy and can be executed independently of each other.
	"""

  def __init__(self, max_workers=None):
    self.executor = ProcessPoolExecutor(max_workers=max_workers)

  def submit(self, fn, *args, **kwargs):
    name = getattr(fn, '__name__', repr(fn))
    # Worker processes do not inherit the request's log context, so pass it along.
    ctx = current_context()
    # The child does not log a failure; the done callback below logs it once,
    # also when the task never started (e.g. an argument that cannot be pickled).
    future = self.executor.submit(run_with_context, ctx, name, fn, *args, log_failure=False, **kwargs)
    future.add_done_callback(lambda f: _log_task_failure(name, ctx, f))
    return future

  def map(self, fn, *iterables, timeout=None, chunksize=1):
    return self.executor.map(fn, *iterables, timeout=timeout, chunksize=chunksize)


def _log_task_failure(name, ctx, future):
  if future.cancelled():
    return
  exc = future.exception()
  if exc is None:
    return
  # The callback runs in the pool's manager thread, or in the submitting thread when
  # the future is already done: bind the submitter's context, then put back what was there.
  previous = current_context()
  clear()
  bind(**ctx)
  try:
    logger.error("background task %s failed", name, exc_info=exc)
  finally:
    clear()
    bind(**previous)
