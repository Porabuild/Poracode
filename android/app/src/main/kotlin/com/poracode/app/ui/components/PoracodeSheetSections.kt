package com.poracode.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.poracode.app.ui.theme.PoracodeIcons
import com.poracode.app.ui.theme.PoracodeTheme

/** One selectable value inside a composer-controls sheet section. */
data class PoracodeChoiceOption(
    val id: String,
    val label: String,
    val description: String? = null,
)

/** Sheet-action row for one option; the selected row carries an accent check. */
@Composable
fun PoracodeOptionRow(
    option: PoracodeChoiceOption,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = PoracodeTheme.colors
    PoracodeSheetAction(
        label = option.label,
        description = option.description,
        selected = selected,
        enabled = enabled,
        onClick = onClick,
        modifier = modifier,
        trailing = if (selected) {
            {
                Icon(
                    PoracodeIcons.Check,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = colors.foreground,
                )
            }
        } else {
            null
        },
    )
}

/** Vertical stack of option rows sharing one selection. */
@Composable
fun PoracodeOptionList(
    options: List<PoracodeChoiceOption>,
    selectedId: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        options.forEach { option ->
            PoracodeOptionRow(
                option = option,
                selected = option.id == selectedId,
                onClick = { onSelect(option.id) },
                enabled = enabled,
            )
        }
    }
}

/** Labelled on/off row used by the composer-controls sheets. */
@Composable
fun PoracodeToggleRow(
    label: String,
    checked: Boolean,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    val colors = PoracodeTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(
                value = checked,
                enabled = enabled,
                role = Role.Switch,
                onValueChange = onCheckedChange,
            )
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            modifier = Modifier.weight(1f),
            style = MaterialTheme.typography.bodyMedium,
            color = if (enabled) colors.foreground else colors.muted.copy(alpha = 0.5f),
            maxLines = 2,
        )
        PoracodeSwitch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
        )
    }
}

/**
 * Section label plus its control: a [PoracodeSegmentedControl] for small
 * mutually exclusive sets, option rows for larger ones.
 */
@Composable
fun PoracodeChoiceSection(
    label: String,
    options: List<PoracodeChoiceOption>,
    selectedId: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    segmentedMaxOptions: Int = 4,
) {
    if (options.isEmpty()) return
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        PoracodeSectionLabel(label)
        if (options.size <= segmentedMaxOptions) {
            val selectedIndex = options.indexOfFirst { it.id == selectedId }
                .coerceAtLeast(0)
            PoracodeSegmentedControl(
                options = options.map { it.label },
                selectedIndex = selectedIndex,
                onSelect = { onSelect(options[it].id) },
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            PoracodeOptionList(
                options = options,
                selectedId = selectedId,
                onSelect = onSelect,
                enabled = enabled,
            )
        }
    }
}
