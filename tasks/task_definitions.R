load_task_definitions <- function(tasks_root) {
  task_definition_dir <- file.path(tasks_root, "task_definitions")

  source(file.path(task_definition_dir, "stop_change_two.R"), local = TRUE)
  source(file.path(task_definition_dir, "stop_change_three.R"), local = TRUE)
  source(file.path(task_definition_dir, "stop_change_four.R"), local = TRUE)
  source(file.path(task_definition_dir, "stop_signal.R"), local = TRUE)
  source(file.path(task_definition_dir, "stimulus_selective.R"), local = TRUE)

  list(
    stop_change_two = define_stop_change_two(),
    stop_change_three = define_stop_change_three(),
    stop_change_four = define_stop_change_four(),
    stop_signal = define_stop_signal(),
    stimulus_selective = define_stimulus_selective()
  )
}
