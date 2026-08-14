define_stimulus_selective <- function() {
  list(
    orientation_keys = c("left_shift", "left_inner"),
    fill_keys = character(0),
    use_fill_dimension = FALSE,
    stop_rules = data.frame(
      stop_rule = c("withhold", "ignore"),
      signal = c("red", "blue"),
      outcome = c("withhold", "orientation_key"),
      key = c("", ""),
      weight = c(1, 1),
      requires_signal = c(FALSE, FALSE),
      stringsAsFactors = FALSE
    )
  )
}
