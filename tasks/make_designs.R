rm(list = ls())

n_subjects <- 10L
n_trials <- 200L
trials_per_block <- 40L
go_probability <- 0.7

initial_ssd <- 200L
fixation_duration <- 500L
response_window <- 1500L
iti <- 500L

get_script_dir <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  script_arg <- args[startsWith(args, "--file=")]

  if (length(script_arg) > 0L) {
    script_path <- sub("^--file=", "", script_arg[1L])

    if (script_path != "-" && file.exists(script_path)) {
      return(dirname(normalizePath(script_path)))
    }
  }

  if (!is.null(sys.frames()[[1L]]$ofile)) {
    return(dirname(normalizePath(sys.frames()[[1L]]$ofile)))
  }

  getwd()
}

output_root <- file.path(get_script_dir(), "designs")

tasks <- list(
  stop_change_two = list(
    go_keys = c(left = "z", right = "m"),
    stop_rules = data.frame(
      stop_rule = "opposite",
      signal = "blue",
      outcome = "opposite_go_key",
      key = "",
      change_left = "",
      change_right = "",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  ),
  stop_change_three = list(
    go_keys = c(left = "z", right = "c"),
    stop_rules = data.frame(
      stop_rule = "change",
      signal = "blue",
      outcome = "fixed_key",
      key = "m",
      change_left = "",
      change_right = "",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  ),
  stop_change_four = list(
    go_keys = c(left = "z", right = "c"),
    stop_rules = data.frame(
      stop_rule = "direction_change",
      signal = "blue",
      outcome = "direction_change_key",
      key = "",
      change_left = "b",
      change_right = "m",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  ),
  stimulus_selective = list(
    go_keys = c(left = "z", right = "m"),
    stop_rules = data.frame(
      stop_rule = c("withhold", "ignore"),
      signal = c("red", "blue"),
      outcome = c("withhold", "go_key"),
      key = c("", ""),
      change_left = c("", ""),
      change_right = c("", ""),
      weight = c(1, 1),
      requires_signal = c(FALSE, FALSE),
      stringsAsFactors = FALSE
    )
  )
)

allocate_counts <- function(total, weights, rotation = 0L) {
  exact <- total * weights / sum(weights)
  counts <- floor(exact)
  remainder <- total - sum(counts)

  if (remainder > 0L) {
    tie_breaker <- (seq_along(weights) - 1L - rotation) %% length(weights)
    add_order <- order(-(exact - counts), tie_breaker)
    counts[add_order[seq_len(remainder)]] <- counts[add_order[seq_len(remainder)]] + 1L
  }

  as.integer(counts)
}

make_direction_rows <- function(count, rotation = 0L) {
  direction_counts <- allocate_counts(count, c(1, 1), rotation)
  c(rep("left", direction_counts[1L]), rep("right", direction_counts[2L]))
}

opposite_direction <- function(direction) {
  ifelse(direction == "left", "right", "left")
}

get_intended_response <- function(task, trial_type, stop_rule, direction) {
  if (trial_type == "go") {
    return(list(
      intended_action = "respond",
      intended_key = unname(task$go_keys[direction]),
      requires_signal = FALSE
    ))
  }

  rule <- task$stop_rules[task$stop_rules$stop_rule == stop_rule, , drop = FALSE]

  if (rule$outcome == "withhold") {
    return(list(
      intended_action = "withhold",
      intended_key = "",
      requires_signal = FALSE
    ))
  }

  intended_key <- switch(
    rule$outcome,
    go_key = unname(task$go_keys[direction]),
    opposite_go_key = unname(task$go_keys[opposite_direction(direction)]),
    fixed_key = rule$key,
    direction_change_key = ifelse(direction == "left", rule$change_left, rule$change_right)
  )

  list(
    intended_action = "respond",
    intended_key = intended_key,
    requires_signal = rule$requires_signal
  )
}

make_trial_row <- function(subject_id, task_name, task, trial_type, stop_rule, signal, direction) {
  intended <- get_intended_response(task, trial_type, stop_rule, direction)

  data.frame(
    subject = subject_id,
    task = task_name,
    trial_type = trial_type,
    stop_rule = stop_rule,
    signal = signal,
    direction = direction,
    go_key = unname(task$go_keys[direction]),
    intended_action = intended$intended_action,
    intended_key = intended$intended_key,
    requires_signal_for_success = as.integer(intended$requires_signal),
    fixation_duration = fixation_duration,
    response_window = response_window,
    iti = iti,
    initial_ssd = initial_ssd,
    stringsAsFactors = FALSE
  )
}

make_subject_design <- function(task_name, task, subject_id, n_trials, trials_per_block) {
  type_counts <- allocate_counts(
    n_trials,
    c(go_probability, 1 - go_probability),
    subject_id
  )
  rows <- list()

  for (direction in make_direction_rows(type_counts[1L], subject_id)) {
    rows[[length(rows) + 1L]] <- make_trial_row(
      subject_id, task_name, task, "go", "none", "none", direction
    )
  }

  rule_counts <- allocate_counts(type_counts[2L], task$stop_rules$weight, subject_id)

  for (rule_index in seq_len(nrow(task$stop_rules))) {
    rule <- task$stop_rules[rule_index, , drop = FALSE]

    for (direction in make_direction_rows(rule_counts[rule_index], subject_id + rule_index)) {
      rows[[length(rows) + 1L]] <- make_trial_row(
        subject_id,
        task_name,
        task,
        "stop",
        rule$stop_rule,
        rule$signal,
        direction
      )
    }
  }

  design <- do.call(rbind, rows)
  set.seed(subject_id * 100000L + match(task_name, names(tasks)) * 1000L + n_trials)
  design <- design[sample.int(nrow(design)), ]
  design$trial <- seq_len(nrow(design))
  design$block <- ceiling(design$trial / trials_per_block)
  design <- design[
    ,
    c(
      "subject",
      "task",
      "trial",
      "block",
      "trial_type",
      "stop_rule",
      "signal",
      "direction",
      "go_key",
      "intended_action",
      "intended_key",
      "requires_signal_for_success",
      "fixation_duration",
      "response_window",
      "iti",
      "initial_ssd"
    )
  ]
  rownames(design) <- NULL
  design
}

dir.create(output_root, recursive = TRUE, showWarnings = FALSE)

for (task_name in names(tasks)) {
  task_dir <- file.path(output_root, task_name)
  dir.create(task_dir, recursive = TRUE, showWarnings = FALSE)

  for (subject_id in seq_len(n_subjects)) {
    design <- make_subject_design(task_name, tasks[[task_name]], subject_id, n_trials, trials_per_block)
    write.csv(
      design,
      file.path(task_dir, sprintf("subject_%03d.csv", subject_id)),
      row.names = FALSE,
      quote = FALSE
    )
  }
}
