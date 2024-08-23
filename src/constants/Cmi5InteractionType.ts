export const Cmi5InteractionIRI = "http://adlnet.gov/expapi/activities/cmi.interaction" as const;

export class Cmi5InteractionType {
  public static readonly TRUE_FALSE = "true-false";
  public static readonly CHOICE = "choice";
  public static readonly FILL_IN = "fill-in";
  public static readonly LONG_FILL_IN = "long-fill-in";
  public static readonly PERFORMANCE = "performance";
  public static readonly NUMERIC = "numeric";
  public static readonly SEQUENCING = "sequencing";
  public static readonly MATCHING = "matching";
  public static readonly LIKERT = "likert";
}
