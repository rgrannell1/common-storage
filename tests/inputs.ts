
type Thunk<T> = () => T
type Value<T> = Thunk<T> | T

