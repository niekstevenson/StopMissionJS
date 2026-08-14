define_stop_change_two <- function() {
  list(
    orientation_keys = c("left_shift", "left_inner"),
    fill_keys = character(0),
    use_fill_dimension = FALSE,
    stop_rules = data.frame(
      stop_rule = "opposite",
      signal = "blue",
      outcome = "opposite_orientation_key",
      key = "",
      weight = 1,
      requires_signal = TRUE,
      stringsAsFactors = FALSE
    )
  )
}
