rm(list = ls())

n_subjects <- 10L
n_trials <- 200L
trials_per_block <- 40L
go_probability <- 0.7

initial_ssd <- 200L
fixation_duration <- 500L
response_window <- 1500L
iti <- 500L

stimulus_orientations <- c("normal", "rotated")
stimulus_fills <- c("filled", "unfilled")

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

script_dir <- get_script_dir()
output_root <- file.path(script_dir, "designs")
source(file.path(script_dir, "task_definitions.R"))
tasks <- load_task_definitions(script_dir)

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

make_orientation_mapping <- function(keys, subject_id) {
  if ((subject_id - 1L) %% 2L == 1L) {
    return(c(normal = keys[2L], rotated = keys[1L]))
  }

  c(normal = keys[1L], rotated = keys[2L])
}

make_fill_mapping <- function(keys, subject_id) {
  if (((subject_id - 1L) %% 4L) %/% 2L == 1L) {
    return(c(filled = keys[2L], unfilled = keys[1L]))
  }

  c(filled = keys[1L], unfilled = keys[2L])
}

make_mapping_label <- function(mapping) {
  if (length(mapping) == 0L) {
    return("none")
  }

  paste(paste(names(mapping), mapping, sep = "_"), collapse = "_")
}

make_stimulus_rows <- function(count, use_fill_dimension, rotation = 0L) {
  if (count <= 0L) {
    return(data.frame(
      orientation = character(0),
      fill = character(0),
      stringsAsFactors = FALSE
    ))
  }

  if (!use_fill_dimension) {
    orientation_counts <- allocate_counts(count, c(1, 1), rotation)

    return(data.frame(
      orientation = rep(stimulus_orientations, orientation_counts),
      fill = "unfilled",
      stringsAsFactors = FALSE
    ))
  }

  cells <- expand.grid(
    orientation = stimulus_orientations,
    fill = stimulus_fills,
    stringsAsFactors = FALSE
  )
  cell_counts <- allocate_counts(count, rep(1, nrow(cells)), rotation)
  cells[rep(seq_len(nrow(cells)), cell_counts), , drop = FALSE]
}

opposite_orientation <- function(orientation) {
  ifelse(orientation == "normal", "rotated", "normal")
}

get_intended_response <- function(task, mappings, trial_type, stop_rule, orientation, fill) {
  if (trial_type == "go") {
    return(list(
      intended_action = "respond",
      intended_key = unname(mappings$orientation[orientation]),
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
    orientation_key = unname(mappings$orientation[orientation]),
    opposite_orientation_key = unname(mappings$orientation[opposite_orientation(orientation)]),
    fixed_key = rule$key,
    fill_key = unname(mappings$fill[fill])
  )

  list(
    intended_action = "respond",
    intended_key = intended_key,
    requires_signal = rule$requires_signal
  )
}

make_trial_row <- function(subject_id, task_name, task, mappings, trial_type, stop_rule, signal, orientation, fill) {
  intended <- get_intended_response(task, mappings, trial_type, stop_rule, orientation, fill)

  data.frame(
    subject = subject_id,
    task = task_name,
    counterbalance = ((subject_id - 1L) %% ifelse(task$use_fill_dimension, 4L, 2L)) + 1L,
    orientation_mapping = make_mapping_label(mappings$orientation),
    fill_mapping = make_mapping_label(mappings$fill),
    trial_type = trial_type,
    stop_rule = stop_rule,
    signal = signal,
    orientation = orientation,
    fill = fill,
    orientation_key = unname(mappings$orientation[orientation]),
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
  mappings <- list(
    orientation = make_orientation_mapping(task$orientation_keys, subject_id),
    fill = if (task$use_fill_dimension) make_fill_mapping(task$fill_keys, subject_id) else character(0)
  )
  type_counts <- allocate_counts(
    n_trials,
    c(go_probability, 1 - go_probability),
    subject_id
  )
  rows <- list()

  go_stimuli <- make_stimulus_rows(type_counts[1L], task$use_fill_dimension, subject_id)

  for (row_index in seq_len(nrow(go_stimuli))) {
    stimulus <- go_stimuli[row_index, , drop = FALSE]
    rows[[length(rows) + 1L]] <- make_trial_row(
      subject_id, task_name, task, mappings, "go", "none", "none", stimulus$orientation, stimulus$fill
    )
  }

  rule_counts <- allocate_counts(type_counts[2L], task$stop_rules$weight, subject_id)

  for (rule_index in seq_len(nrow(task$stop_rules))) {
    rule <- task$stop_rules[rule_index, , drop = FALSE]
    stop_stimuli <- make_stimulus_rows(
      rule_counts[rule_index],
      task$use_fill_dimension,
      subject_id + rule_index
    )

    for (row_index in seq_len(nrow(stop_stimuli))) {
      stimulus <- stop_stimuli[row_index, , drop = FALSE]
      rows[[length(rows) + 1L]] <- make_trial_row(
        subject_id,
        task_name,
        task,
        mappings,
        "stop",
        rule$stop_rule,
        rule$signal,
        stimulus$orientation,
        stimulus$fill
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
      "counterbalance",
      "orientation_mapping",
      "fill_mapping",
      "trial_type",
      "stop_rule",
      "signal",
      "orientation",
      "fill",
      "orientation_key",
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
