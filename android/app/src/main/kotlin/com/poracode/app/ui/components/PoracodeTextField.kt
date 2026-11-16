package com.poracode.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeMetrics
import com.poracode.app.ui.theme.PoracodeRadius
import com.poracode.app.ui.theme.PoracodeTextStyles
import com.poracode.app.ui.theme.PoracodeTheme

/**
 * The PWA field (`--field-background`, flat fill, compact radius, label above),
 * signature-compatible with the Material `OutlinedTextField` call sites it replaces.
 * The label renders inside the text field's decoration so it stays part of the
 * editable node's accessibility semantics, as with Material fields.
 */
@Composable
fun PoracodeTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    textStyle: TextStyle = LocalTextStyle.current,
    label: (@Composable () -> Unit)? = null,
    placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    prefix: (@Composable () -> Unit)? = null,
    supportingText: (@Composable () -> Unit)? = null,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
    shape: Shape? = null,
    interactionSource: MutableInteractionSource? = null,
) {
    val source = interactionSource ?: remember { MutableInteractionSource() }
    val style = fieldTextStyle(textStyle, enabled)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        enabled = enabled,
        readOnly = readOnly,
        textStyle = style,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        maxLines = maxLines,
        minLines = minLines,
        visualTransformation = visualTransformation,
        interactionSource = source,
        cursorBrush = SolidColor(PoracodeTheme.colors.foreground),
        decorationBox = { inner ->
            PoracodeFieldDecoration(
                isEmpty = value.isEmpty(),
                inner = inner,
                interactionSource = source,
                enabled = enabled,
                isError = isError,
                singleLine = singleLine,
                shape = shape,
                label = label,
                placeholder = placeholder,
                leadingIcon = leadingIcon,
                trailingIcon = trailingIcon,
                prefix = prefix,
                supportingText = supportingText,
            )
        },
    )
}

@Composable
fun PoracodeTextField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    textStyle: TextStyle = LocalTextStyle.current,
    label: (@Composable () -> Unit)? = null,
    placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    prefix: (@Composable () -> Unit)? = null,
    supportingText: (@Composable () -> Unit)? = null,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
    shape: Shape? = null,
    interactionSource: MutableInteractionSource? = null,
) {
    val source = interactionSource ?: remember { MutableInteractionSource() }
    val style = fieldTextStyle(textStyle, enabled)
    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        enabled = enabled,
        readOnly = readOnly,
        textStyle = style,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        maxLines = maxLines,
        minLines = minLines,
        visualTransformation = visualTransformation,
        interactionSource = source,
        cursorBrush = SolidColor(PoracodeTheme.colors.foreground),
        decorationBox = { inner ->
            PoracodeFieldDecoration(
                isEmpty = value.text.isEmpty(),
                inner = inner,
                interactionSource = source,
                enabled = enabled,
                isError = isError,
                singleLine = singleLine,
                shape = shape,
                label = label,
                placeholder = placeholder,
                leadingIcon = leadingIcon,
                trailingIcon = trailingIcon,
                prefix = prefix,
                supportingText = supportingText,
            )
        },
    )
}

@Composable
private fun fieldTextStyle(textStyle: TextStyle, enabled: Boolean): TextStyle {
    val colors = PoracodeTheme.colors
    val base = MaterialTheme.typography.bodyLarge.merge(textStyle)
    val color = base.color.takeIf { it.isSpecified() } ?: colors.foreground
    return base.copy(color = if (enabled) color else color.copy(alpha = 0.5f))
}

private fun androidx.compose.ui.graphics.Color.isSpecified() =
    this != androidx.compose.ui.graphics.Color.Unspecified

@Composable
private fun PoracodeFieldDecoration(
    isEmpty: Boolean,
    inner: @Composable () -> Unit,
    interactionSource: MutableInteractionSource,
    enabled: Boolean,
    isError: Boolean,
    singleLine: Boolean,
    shape: Shape?,
    label: (@Composable () -> Unit)?,
    placeholder: (@Composable () -> Unit)?,
    leadingIcon: (@Composable () -> Unit)?,
    trailingIcon: (@Composable () -> Unit)?,
    prefix: (@Composable () -> Unit)?,
    supportingText: (@Composable () -> Unit)?,
) {
    val colors = PoracodeTheme.colors
    val focused by interactionSource.collectIsFocusedAsState()
    val fieldShape = shape ?: RoundedCornerShape(PoracodeRadius.field)
    val borderColor = when {
        isError -> colors.danger
        focused -> colors.foreground.copy(alpha = 0.45f)
        else -> colors.fieldBorder
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (label != null) {
            CompositionLocalProvider(
                LocalTextStyle provides MaterialTheme.typography.labelMedium,
                LocalContentColor provides if (isError) colors.danger else colors.foreground,
            ) { label() }
        }
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = PoracodeMetrics.tapTarget)
                .clip(fieldShape)
                .background(colors.fieldBackground)
                .border(1.dp, borderColor, fieldShape)
                .alpha(if (enabled) 1f else 0.6f)
                .padding(start = if (leadingIcon != null) 8.dp else 12.dp, end = if (trailingIcon != null) 4.dp else 12.dp),
            verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (leadingIcon != null) {
                CompositionLocalProvider(LocalContentColor provides colors.muted) {
                    Box(Modifier.padding(vertical = if (singleLine) 0.dp else 10.dp)) { leadingIcon() }
                }
            }
            if (prefix != null) {
                CompositionLocalProvider(
                    LocalContentColor provides colors.muted,
                    LocalTextStyle provides MaterialTheme.typography.bodyLarge,
                ) {
                    Box(Modifier.padding(vertical = if (singleLine) 0.dp else 11.dp)) { prefix() }
                }
            }
            Box(
                Modifier
                    .weight(1f)
                    .padding(vertical = 11.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (isEmpty && placeholder != null) {
                    CompositionLocalProvider(
                        LocalContentColor provides colors.fieldPlaceholder,
                        LocalTextStyle provides MaterialTheme.typography.bodyLarge.copy(color = colors.fieldPlaceholder),
                    ) { placeholder() }
                }
                inner()
            }
            if (trailingIcon != null) {
                CompositionLocalProvider(LocalContentColor provides colors.muted) {
                    Box(Modifier.padding(vertical = if (singleLine) 0.dp else 2.dp)) { trailingIcon() }
                }
            }
        }
        if (supportingText != null) {
            CompositionLocalProvider(
                LocalTextStyle provides PoracodeTextStyles.rowDescription,
                LocalContentColor provides if (isError) colors.danger else colors.muted,
            ) {
                Box(Modifier.padding(horizontal = 2.dp)) { supportingText() }
            }
        }
    }
}
