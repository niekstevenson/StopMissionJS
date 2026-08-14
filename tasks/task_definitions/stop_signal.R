define_stop_signal <- function() {
  list(
    orientation_keys = c("left_shift", "left_inner"),
    fill_keys = character(0),
    use_fill_dimension = FALSE,
    stop_rules = data.frame(
      stop_rule = "withhold",
      signal = "red",
      outcome = "withhold",
      key = "",
      weight = 1,
      requires_signal = FALSE,
      stringsAsFactors = FALSE
    )
  )
}
