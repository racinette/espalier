# requiredness: instantiating a dynamic directory

`clients/[provider]/` may have zero instances. Once one exists, its static
descendants are required for that instance and only that instance.

stripe/ is complete. twilio/ is missing requestModels.ts.

Pins: MATCHING.MD "What must exist".
